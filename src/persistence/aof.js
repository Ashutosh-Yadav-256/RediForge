'use strict';

var fs = require('fs');
var path = require('path');
var logger = require('../utils/logger');
var RespParser = require('../protocol/parser').RespParser;

function AofPersistence(config, store) {
    this._config = config;
    this._store = store;
    this._fd = null;
    this._writeBuffer = [];
    this._syncTimer = null;
    this._log = logger.getLogger();
}

AofPersistence.prototype.getFilePath = function () {
    var dir = this._config.get('dir');
    var filename = this._config.get('aof_filename');
    return path.resolve(dir, filename);
};

AofPersistence.prototype.open = function () {
    if (!this._config.get('appendonly')) return;

    var filePath = this.getFilePath();
    try {
        this._fd = fs.openSync(filePath, 'a');
        this._log.info('AOF: opened ' + filePath);
        this._startSync();
    } catch (err) {
        this._log.error('AOF: failed to open - ' + err.message);
    }
};

AofPersistence.prototype.close = function () {
    this._stopSync();
    this._flush();
    if (this._fd !== null) {
        try { fs.closeSync(this._fd); } catch (e) {}
        this._fd = null;
    }
};

AofPersistence.prototype.truncate = function () {
    var filePath = this.getFilePath();
    this.close();
    try {
        fs.writeFileSync(filePath, '', 'utf8');
        this._log.info('AOF: truncated ' + filePath);
    } catch (err) {
        this._log.error('AOF: truncate failed - ' + err.message);
    }
    this.open();
};

AofPersistence.prototype.appendCommand = function (cmdParts) {
    if (this._fd === null || !cmdParts || cmdParts.length === 0) return;

    var chunks = [Buffer.from('*' + cmdParts.length + '\r\n')];
    for (var i = 0; i < cmdParts.length; i++) {
        var part = cmdParts[i];
        if (Buffer.isBuffer(part)) {
            chunks.push(Buffer.from('$' + part.length + '\r\n'));
            chunks.push(part);
            chunks.push(Buffer.from('\r\n'));
        } else {
            var s = typeof part === 'string' ? part : String(part);
            var len = Buffer.byteLength(s);
            chunks.push(Buffer.from('$' + len + '\r\n' + s + '\r\n'));
        }
    }

    this._writeBuffer.push(Buffer.concat(chunks));

    var policy = this._config.get('appendfsync');
    if (policy === 'always') {
        this._flush();
    }
};

AofPersistence.prototype.appendEvent = function (event) {
    if (!event) return;
    if (typeof event.db === 'number' && event.db !== this._currentDb) {
        this._currentDb = event.db;
        this.appendCommand(['SELECT', String(event.db)]);
    }
    var cmdParts = [event.command].concat(event.args || []);
    this.appendCommand(cmdParts);
};

function decodeReplayPart(part, isCmdOrKey) {
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

AofPersistence.prototype.replay = function (dispatchFn, ctx) {
    var filePath = this.getFilePath();

    if (!fs.existsSync(filePath)) {
        this._log.info('AOF: no file found at ' + filePath);
        return 0;
    }

    var fd;
    try {
        fd = fs.openSync(filePath, 'r');
    } catch (err) {
        this._log.error('AOF: open for replay failed - ' + err.message);
        return 0;
    }

    var parser = new RespParser({ returnBuffers: true });
    var replayed = 0;
    var CHUNK_SIZE = 64 * 1024;
    var chunk = Buffer.alloc(CHUNK_SIZE);

    try {
        var bytesRead = 0;
        while ((bytesRead = fs.readSync(fd, chunk, 0, CHUNK_SIZE, null)) > 0) {
            var slice = chunk.subarray(0, bytesRead);
            parser.append(slice);
            var commands = parser.parse();

            for (var i = 0; i < commands.length; i++) {
                var rawCmd = commands[i];
                if (Array.isArray(rawCmd) && rawCmd.length > 0) {
                    try {
                        var cmd = [];
                        for (var k = 0; k < rawCmd.length; k++) {
                            cmd.push(decodeReplayPart(rawCmd[k], k === 0 || k === 1));
                        }
                        dispatchFn(cmd, ctx);
                        replayed++;
                    } catch (err) {
                        this._log.error('AOF: replay error at command ' + replayed + ' - ' + err.message);
                    }
                }
            }
        }

        if (parser.pending > 0) {
            this._log.warn('AOF: detected truncated final command of ' + parser.pending + ' bytes at end of ' + filePath);
        }
    } catch (err) {
        this._log.error('AOF: replay error - ' + err.message);
    } finally {
        try { fs.closeSync(fd); } catch (e) {}
    }

    this._log.info('AOF: replayed ' + replayed + ' commands from ' + filePath);
    return replayed;
};

AofPersistence.prototype._flush = function () {
    if (this._fd === null || this._writeBuffer.length === 0) return;

    var data = Buffer.concat(this._writeBuffer);
    this._writeBuffer = [];

    try {
        fs.writeSync(this._fd, data);
        var policy = this._config.get('appendfsync');
        if (policy === 'always' || policy === 'everysec') {
            fs.fsyncSync(this._fd);
        }
    } catch (err) {
        this._log.error('AOF: write failed - ' + err.message);
    }
};

AofPersistence.prototype._startSync = function () {
    var policy = this._config.get('appendfsync');
    if (policy === 'everysec') {
        var self = this;
        this._syncTimer = setInterval(function () {
            self._flush();
        }, 1000);

        if (this._syncTimer.unref) {
            this._syncTimer.unref();
        }
    }
};

AofPersistence.prototype._stopSync = function () {
    if (this._syncTimer) {
        clearInterval(this._syncTimer);
        this._syncTimer = null;
    }
};

module.exports = { AofPersistence: AofPersistence };
