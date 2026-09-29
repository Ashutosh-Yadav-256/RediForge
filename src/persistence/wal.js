'use strict';

var fs = require('fs');
var path = require('path');
var logger = require('../utils/logger');
var RespParser = require('../protocol/parser').RespParser;

function WriteAheadLog(config, options) {
    this._config = config;
    this._options = options || {};
    this._fd = null;
    this._writeBuffer = [];
    this._currentDb = 0;
    this._currentSequence = 0;
    this._offset = 0;
    this._log = logger.getLogger();
}

WriteAheadLog.prototype.getFilePath = function () {
    var dir = (this._config && typeof this._config.get === 'function') ? this._config.get('dir') : '.';
    var filename = this._options.filename || ((this._config && typeof this._config.get === 'function') ? this._config.get('aof_filename') : null) || 'appendonly.aof';
    return path.resolve(dir, filename);
};

Object.defineProperty(WriteAheadLog.prototype, 'currentOffset', {
    get: function () { return this._offset; }
});

Object.defineProperty(WriteAheadLog.prototype, 'currentSequence', {
    get: function () { return this._currentSequence; }
});

WriteAheadLog.prototype.open = function () {
    var filePath = this.getFilePath();
    try {
        var dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this._fd = fs.openSync(filePath, 'a+');
        var stats = fs.fstatSync(this._fd);
        this._offset = stats.size;
        this._log.info('WAL: opened ' + filePath + ' at offset ' + this._offset);
    } catch (err) {
        this._log.error('WAL: failed to open - ' + err.message);
    }
};

WriteAheadLog.prototype.close = function () {
    this.flush();
    if (this._fd !== null) {
        try { fs.closeSync(this._fd); } catch (e) {}
        this._fd = null;
    }
};

WriteAheadLog.prototype.flush = function () {
    if (this._fd === null || this._writeBuffer.length === 0) return;
    try {
        var buf = Buffer.concat(this._writeBuffer);
        this._writeBuffer = [];
        fs.writeSync(this._fd, buf);
        this._offset += buf.length;
        fs.fsyncSync(this._fd);
    } catch (err) {
        this._log.error('WAL: flush error - ' + err.message);
    }
};

WriteAheadLog.prototype.appendEvent = function (event) {
    if (!event) return;
    this._currentSequence = event.sequence || (this._currentSequence + 1);

    var chunks = [];

    if (typeof event.db === 'number' && event.db !== this._currentDb) {
        this._currentDb = event.db;
        var selectStr = '*2\r\n$6\r\nSELECT\r\n$' + String(event.db).length + '\r\n' + event.db + '\r\n';
        chunks.push(Buffer.from(selectStr, 'utf8'));
    }

    var parts = [event.command].concat(event.args || []);
    chunks.push(Buffer.from('*' + parts.length + '\r\n', 'utf8'));
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (Buffer.isBuffer(p)) {
            chunks.push(Buffer.from('$' + p.length + '\r\n', 'utf8'));
            chunks.push(p);
            chunks.push(Buffer.from('\r\n', 'utf8'));
        } else {
            var s = typeof p === 'string' ? p : String(p);
            var len = Buffer.byteLength(s, 'utf8');
            chunks.push(Buffer.from('$' + len + '\r\n' + s + '\r\n', 'utf8'));
        }
    }

    var recordBuf = Buffer.concat(chunks);
    this._writeBuffer.push(recordBuf);

    if (this._fd !== null) {
        var policy = (this._config && typeof this._config.get === 'function') ? this._config.get('appendfsync') : 'always';
        if (policy === 'always' || !policy) {
            this.flush();
        }
    }
};

function decodeWalPart(part, isCmdOrKey) {
    if (!Buffer.isBuffer(part)) {
        return typeof part === 'string' ? part : String(part);
    }
    if (isCmdOrKey) {
        return part.toString('utf8');
    }
    if (part.includes(0x00)) {
        return part;
    }
    var str = part.toString('utf8');
    if (Buffer.from(str, 'utf8').equals(part)) {
        return str;
    }
    return part;
}

WriteAheadLog.prototype.replay = function (onCommand) {
    var filePath = this.getFilePath();
    if (!fs.existsSync(filePath)) return { replayed: 0, truncated: false };

    var fd;
    try {
        fd = fs.openSync(filePath, 'r');
    } catch (err) {
        this._log.error('WAL: open for replay failed - ' + err.message);
        return { replayed: 0, truncated: false };
    }

    var parser = new RespParser({ returnBuffers: true });
    var replayed = 0;
    var currentDb = 0;
    var CHUNK_SIZE = 64 * 1024;
    var chunk = Buffer.alloc(CHUNK_SIZE);
    var hasTruncatedTail = false;

    try {
        var bytesRead = 0;
        while ((bytesRead = fs.readSync(fd, chunk, 0, CHUNK_SIZE, null)) > 0) {
            var slice = chunk.subarray(0, bytesRead);
            try {
                parser.append(slice);
            } catch (err) {
                this._log.error('WAL: corrupted record encountered - ' + err.message);
                break;
            }
            var commands = parser.parse();

            for (var i = 0; i < commands.length; i++) {
                var rawCmd = commands[i];
                if (Array.isArray(rawCmd) && rawCmd.length > 0) {
                    var cmdName = Buffer.isBuffer(rawCmd[0]) ? rawCmd[0].toString('utf8').toUpperCase() : String(rawCmd[0]).toUpperCase();
                    if (cmdName === 'SELECT' && rawCmd.length > 1) {
                        var dbVal = Buffer.isBuffer(rawCmd[1]) ? rawCmd[1].toString('utf8') : String(rawCmd[1]);
                        currentDb = parseInt(dbVal, 10) || 0;
                        continue;
                    }
                    if (typeof onCommand === 'function') {
                        var decoded = [];
                        for (var k = 0; k < rawCmd.length; k++) {
                            decoded.push(decodeWalPart(rawCmd[k], k === 0 || k === 1));
                        }
                        onCommand(decoded, currentDb);
                    }
                    replayed++;
                }
            }
        }

        if (parser._buffer && parser._buffer.length > 0) {
            hasTruncatedTail = true;
            this._log.warn('WAL: detected truncated final record of ' + parser._buffer.length + ' bytes at EOF');
        }
    } finally {
        try { fs.closeSync(fd); } catch (e) {}
    }

    return { replayed: replayed, truncated: hasTruncatedTail };
};

module.exports = { WriteAheadLog: WriteAheadLog };
