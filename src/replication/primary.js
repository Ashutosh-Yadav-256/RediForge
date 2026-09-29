'use strict';

var crypto = require('crypto');
var ReplicationBacklog = require('./backlog').ReplicationBacklog;
var protocol = require('./protocol');
var logger = require('../utils/logger');

function generateReplicationId() {
    return crypto.randomBytes(20).toString('hex');
}

function PrimaryReplication(server, options) {
    this.server = server;
    this.options = options || {};
    this.nodeId = this.options.nodeId || crypto.randomUUID ? crypto.randomUUID() : generateReplicationId();
    this.replicationId = this.options.replicationId || generateReplicationId();
    this.currentOffset = 0;
    this._currentDb = 0;
    this.backlog = new ReplicationBacklog(this.options.backlogSize || (10 * 1024 * 1024));
    this.replicas = new Map();
    this._log = logger.getLogger();

    var self = this;
    if (server && server.mutationEngine) {
        server.mutationEngine.on('mutation', function (event) {
            self._onMutation(event);
        });
    }
}

PrimaryReplication.prototype._onMutation = function (event) {
    var chunks = [];

    if (typeof event.db === 'number' && event.db !== this._currentDb) {
        this._currentDb = event.db;
        chunks.push(protocol.encodeCommand('SELECT', [String(event.db)]));
    }

    var cmdBuf = protocol.encodeCommand(event.command, event.args);
    chunks.push(cmdBuf);

    var totalBuf = Buffer.concat(chunks);
    this.backlog.append(totalBuf);
    this.currentOffset += totalBuf.length;

    for (var [conn, repInfo] of this.replicas.entries()) {
        if (repInfo.state === protocol.STATE_ONLINE) {
            try {
                conn.write(totalBuf);
            } catch (err) {
                this._log.error('Primary: error streaming to replica - ' + err.message);
            }
        }
    }
};

PrimaryReplication.prototype.handlePsync = function (conn, replId, offsetStr) {
    var reqOffset = parseInt(offsetStr, 10);
    var canPartial = (replId === this.replicationId) && (!isNaN(reqOffset)) && this.backlog.canProvide(reqOffset);

    if (canPartial) {
        this._log.info('Primary: partial resynchronization (PSYNC) accepted for replica from offset ' + reqOffset);
        var continueHeader = protocol.encodeContinue(this.replicationId);
        conn.write(continueHeader);

        var slice = this.backlog.sliceFrom(reqOffset);
        if (slice && slice.length > 0) {
            conn.write(slice);
        }

        this.replicas.set(conn, {
            state: protocol.STATE_ONLINE,
            ackOffset: reqOffset,
            lastAckTime: Date.now(),
            lag: Math.max(0, this.currentOffset - reqOffset)
        });

        return { type: 'CONTINUE', offset: this.currentOffset };
    }

    this._log.info('Primary: performing full resynchronization (FULLRESYNC) for replica at offset ' + this.currentOffset);
    var fullResyncHeader = protocol.encodeFullResync(this.replicationId, this.currentOffset);
    conn.write(fullResyncHeader);

    var snapshotObj = this.server.store.exportSnapshot();
    var snapshotJson = Buffer.from(JSON.stringify(snapshotObj), 'utf8');

    var bulkHeader = Buffer.from('$' + snapshotJson.length + '\r\n', 'utf8');
    var bulkFooter = Buffer.from('\r\n', 'utf8');

    conn.write(Buffer.concat([bulkHeader, snapshotJson, bulkFooter]));

    this.replicas.set(conn, {
        state: protocol.STATE_ONLINE,
        ackOffset: this.currentOffset,
        lastAckTime: Date.now(),
        lag: 0
    });

    return { type: 'FULLRESYNC', offset: this.currentOffset };
};

PrimaryReplication.prototype.handleReplconf = function (conn, args) {
    if (!args || args.length === 0) return '+OK\r\n';

    var subCmd = String(args[0]).toUpperCase();
    if (subCmd === 'ACK' && args.length >= 2) {
        var ack = parseInt(args[1], 10);
        var rep = this.replicas.get(conn);
        if (rep) {
            rep.ackOffset = isNaN(ack) ? 0 : ack;
            rep.lastAckTime = Date.now();
            rep.lag = Math.max(0, this.currentOffset - rep.ackOffset);
        }
        return null;
    } else if (subCmd === 'LISTENING-PORT') {
        var repInfo = this.replicas.get(conn) || { state: protocol.STATE_HANDSHAKE };
        repInfo.port = parseInt(args[1], 10) || 6379;
        this.replicas.set(conn, repInfo);
        return '+OK\r\n';
    } else if (subCmd === 'CAPA') {
        return '+OK\r\n';
    }

    return '+OK\r\n';
};

PrimaryReplication.prototype.removeReplica = function (conn) {
    this.replicas.delete(conn);
};

PrimaryReplication.prototype.getInfo = function () {
    var lines = [
        '# Replication',
        'role:master',
        'connected_slaves:' + this.replicas.size,
        'master_replid:' + this.replicationId,
        'master_repl_offset:' + this.currentOffset,
        'repl_backlog_active:' + (this.backlog.buffer.length > 0 ? 1 : 0),
        'repl_backlog_size:' + this.backlog.maxSize,
        'repl_backlog_first_byte_offset:' + this.backlog.firstOffset,
        'repl_backlog_histlen:' + this.backlog.buffer.length
    ];

    var idx = 0;
    for (var [_, info] of this.replicas) {
        lines.push('slave' + idx + ':state=' + info.state + ',offset=' + (info.ackOffset || 0) + ',lag=' + (info.lag || 0));
        idx++;
    }

    return lines.join('\r\n');
};

module.exports = {
    PrimaryReplication: PrimaryReplication,
    generateReplicationId: generateReplicationId
};
