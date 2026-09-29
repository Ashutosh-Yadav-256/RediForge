'use strict';

var net = require('net');
var protocol = require('./protocol');
var RespParser = require('../protocol/parser').RespParser;
var dispatch = require('../commands/registry').dispatch;
var logger = require('../utils/logger');

function ReplicaReplication(server, options) {
    this.server = server;
    this.options = options || {};
    this.role = protocol.ROLE_REPLICA;
    this.masterHost = null;
    this.masterPort = 0;
    this.masterReplicationId = null;
    this.receivedOffset = 0;
    this.state = protocol.STATE_NONE;
    this.socket = null;
    this._ackTimer = null;
    this._parser = new RespParser({ returnBuffers: true });
    this._log = logger.getLogger();
    this._currentDb = 0;
}

ReplicaReplication.prototype.connect = function (host, port, onConnected) {
    var self = this;
    this.masterHost = host;
    this.masterPort = port;
    this.state = protocol.STATE_CONNECTING;

    this.socket = net.connect({ host: host, port: port }, function () {
        self._log.info('Replica: connected to master at ' + host + ':' + port);
        self.state = protocol.STATE_SEND_HANDSHAKE;
        self._sendHandshake(onConnected);
    });

    this.socket.on('error', function (err) {
        self._log.error('Replica: connection error - ' + err.message);
        self._cleanup();
    });

    this.socket.on('close', function () {
        self._log.info('Replica: connection closed');
        self._cleanup();
    });
};

ReplicaReplication.prototype._sendHandshake = function (onConnected) {
    var self = this;

    this.socket.write(protocol.encodeCommand('PING', []));

    var handshakeStage = 0;
    var onData = function (chunk) {
        var str = chunk.toString('utf8');

        if (handshakeStage === 0 && str.startsWith('+PONG')) {
            handshakeStage = 1;
            var listenPort = (self.server && self.server.config && self.server.config.get('port')) || 6380;
            self.socket.write(protocol.encodeCommand('REPLCONF', ['listening-port', String(listenPort)]));
        } else if (handshakeStage === 1 && str.startsWith('+OK')) {
            handshakeStage = 2;
            var replId = self.masterReplicationId || '?';
            var offset = self.receivedOffset > 0 ? String(self.receivedOffset) : '-1';
            self.socket.write(protocol.encodeCommand('PSYNC', [replId, offset]));
        } else if (handshakeStage === 2) {
            self.socket.removeListener('data', onData);
            self._handlePsyncResponse(chunk, onConnected);
        }
    };

    this.socket.on('data', onData);
};

ReplicaReplication.prototype._handlePsyncResponse = function (initialChunk, onConnected) {
    var self = this;
    var buffer = initialChunk || Buffer.alloc(0);

    var checkResponse = function () {
        var str = buffer.toString('utf8');

        if (str.startsWith('+CONTINUE')) {
            self._log.info('Replica: received +CONTINUE (partial resync)');
            self.state = protocol.STATE_ONLINE;

            var headerEnd = buffer.indexOf('\r\n');
            var remaining = headerEnd !== -1 ? buffer.subarray(headerEnd + 2) : Buffer.alloc(0);

            self.socket.removeListener('data', onMoreData);
            self._startStreaming(remaining);
            if (typeof onConnected === 'function') onConnected(null, { type: 'CONTINUE' });
            return;
        }

        if (str.startsWith('+FULLRESYNC')) {
            var fullHeaderEnd = buffer.indexOf('\r\n');
            if (fullHeaderEnd === -1) return;

            var headerLine = buffer.subarray(0, fullHeaderEnd).toString('utf8');
            var parts = headerLine.split(' ');
            self.masterReplicationId = parts[1];
            self.receivedOffset = parseInt(parts[2], 10) || 0;

            var rest = buffer.subarray(fullHeaderEnd + 2);
            var lenEnd = rest.indexOf('\r\n');
            if (lenEnd === -1) return;

            var lenStr = rest.subarray(1, lenEnd).toString('utf8');
            var snapshotLen = parseInt(lenStr, 10);
            var snapshotDataStart = lenEnd + 2;

            if (rest.length < snapshotDataStart + snapshotLen) {
                return;
            }

            self._log.info('Replica: received complete +FULLRESYNC with id=' + self.masterReplicationId + ' offset=' + self.receivedOffset);
            self.state = protocol.STATE_TRANSFER;

            var snapshotBuf = rest.subarray(snapshotDataStart, snapshotDataStart + snapshotLen);
            var endIdx = snapshotDataStart + snapshotLen;
            if (rest.length >= endIdx + 2 && rest[endIdx] === 0x0d && rest[endIdx + 1] === 0x0a) {
                endIdx += 2;
            }
            var postSnapshot = rest.subarray(endIdx);

            try {
                var snapshotJson = JSON.parse(snapshotBuf.toString('utf8'));
                if (self.server && self.server.store) {
                    self.server.store.importSnapshot(snapshotJson);
                    self._log.info('Replica: full resync snapshot restored successfully');
                }
            } catch (err) {
                self._log.error('Replica: failed to parse snapshot JSON - ' + err.message);
            }

            self.state = protocol.STATE_ONLINE;
            self.socket.removeListener('data', onMoreData);
            self._startStreaming(postSnapshot);
            if (typeof onConnected === 'function') onConnected(null, { type: 'FULLRESYNC' });
        }
    };

    var onMoreData = function (chunk) {
        buffer = Buffer.concat([buffer, chunk]);
        checkResponse();
    };

    self.socket.on('data', onMoreData);
    checkResponse();
};

ReplicaReplication.prototype._startStreaming = function (initialData) {
    var self = this;

    var processChunk = function (chunk) {
        if (!chunk || chunk.length === 0) return;
        self.receivedOffset += chunk.length;

        try {
            self._parser.append(chunk);
        } catch (err) {
            self._log.error('Replica parser error: ' + err.message);
            return;
        }

        var commands = self._parser.parse();
        for (var i = 0; i < commands.length; i++) {
            var rawCmd = commands[i];
            if (Array.isArray(rawCmd) && rawCmd.length > 0) {
                var cmdName = Buffer.isBuffer(rawCmd[0]) ? rawCmd[0].toString('utf8').toUpperCase() : String(rawCmd[0]).toUpperCase();
                if (cmdName === 'SELECT' && rawCmd.length > 1) {
                    var dbVal = Buffer.isBuffer(rawCmd[1]) ? rawCmd[1].toString('utf8') : String(rawCmd[1]);
                    self._currentDb = parseInt(dbVal, 10) || 0;
                    continue;
                }

                if (self.server && self.server.store) {
                    var ctx = {
                        db: self._currentDb,
                        store: self.server.store,
                        config: self.server.config,
                        connection: { db: self._currentDb, id: 0, name: 'replica', txQueue: null },
                        pubsub: self.server.pubsub,
                        clientCount: 0,
                        aofBuffer: null
                    };

                    var decoded = [];
                    for (var k = 0; k < rawCmd.length; k++) {
                        var p = rawCmd[k];
                        if (Buffer.isBuffer(p)) {
                            if (k === 0 || k === 1) {
                                decoded.push(p.toString('utf8'));
                            } else if (p.includes(0x00)) {
                                decoded.push(p);
                            } else {
                                var s = p.toString('utf8');
                                decoded.push(Buffer.from(s, 'utf8').equals(p) ? s : p);
                            }
                        } else {
                            decoded.push(typeof p === 'string' ? p : String(p));
                        }
                    }

                    self.server.store._restoring = true;
                    try {
                        dispatch(decoded, ctx);
                    } catch (dErr) {
                        self._log.error('Replica: dispatch error - ' + dErr.message);
                    } finally {
                        self.server.store._restoring = false;
                    }
                }
            }
        }
    };

    if (initialData && initialData.length > 0) {
        processChunk(initialData);
    }

    this.socket.on('data', processChunk);

    this._startAckTimer();
};

ReplicaReplication.prototype._startAckTimer = function () {
    var self = this;
    if (this._ackTimer) clearInterval(this._ackTimer);

    this._ackTimer = setInterval(function () {
        if (self.socket && !self.socket.destroyed && self.state === protocol.STATE_ONLINE) {
            try {
                self.socket.write(protocol.encodeReplconfAck(self.receivedOffset));
            } catch (e) {}
        }
    }, 1000);

    if (this._ackTimer.unref) this._ackTimer.unref();
};

ReplicaReplication.prototype._cleanup = function () {
    if (this._ackTimer) {
        clearInterval(this._ackTimer);
        this._ackTimer = null;
    }
    this.state = protocol.STATE_NONE;
    if (this.socket) {
        try { this.socket.destroy(); } catch (e) {}
        this.socket = null;
    }
};

ReplicaReplication.prototype.disconnect = function () {
    this._cleanup();
};

ReplicaReplication.prototype.getInfo = function () {
    return [
        '# Replication',
        'role:slave',
        'master_host:' + (this.masterHost || 'none'),
        'master_port:' + this.masterPort,
        'master_link_status:' + (this.state === protocol.STATE_ONLINE ? 'up' : 'down'),
        'master_replid:' + (this.masterReplicationId || 'none'),
        'slave_repl_offset:' + this.receivedOffset
    ].join('\r\n');
};

module.exports = { ReplicaReplication: ReplicaReplication };
