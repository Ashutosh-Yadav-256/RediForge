'use strict';

var encoder = require('../protocol/encoder');

var ROLE_PRIMARY = 'master';
var ROLE_REPLICA = 'slave';

var STATE_NONE = 'none';
var STATE_CONNECT = 'connect';
var STATE_CONNECTING = 'connecting';
var STATE_RECEIVE_PING = 'receive-ping';
var STATE_SEND_HANDSHAKE = 'send-handshake';
var STATE_RECEIVE_PSYNC = 'receive-psync';
var STATE_TRANSFER = 'transfer';
var STATE_CONNECTED = 'connected';
var STATE_ONLINE = 'online';

function encodeCommand(cmdName, args) {
    var parts = [cmdName].concat(args || []);
    var chunks = [Buffer.from('*' + parts.length + '\r\n', 'utf8')];

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
    return Buffer.concat(chunks);
}

function encodeFullResync(replicationId, offset) {
    return Buffer.from('+FULLRESYNC ' + replicationId + ' ' + offset + '\r\n', 'utf8');
}

function encodeContinue(replicationId) {
    return Buffer.from('+CONTINUE\r\n', 'utf8');
}

function encodeReplconfAck(offset) {
    return encodeCommand('REPLCONF', ['ACK', String(offset)]);
}

module.exports = {
    ROLE_PRIMARY: ROLE_PRIMARY,
    ROLE_REPLICA: ROLE_REPLICA,
    STATE_NONE: STATE_NONE,
    STATE_CONNECT: STATE_CONNECT,
    STATE_CONNECTING: STATE_CONNECTING,
    STATE_RECEIVE_PING: STATE_RECEIVE_PING,
    STATE_SEND_HANDSHAKE: STATE_SEND_HANDSHAKE,
    STATE_RECEIVE_PSYNC: STATE_RECEIVE_PSYNC,
    STATE_TRANSFER: STATE_TRANSFER,
    STATE_CONNECTED: STATE_CONNECTED,
    STATE_ONLINE: STATE_ONLINE,
    encodeCommand: encodeCommand,
    encodeFullResync: encodeFullResync,
    encodeContinue: encodeContinue,
    encodeReplconfAck: encodeReplconfAck
};
