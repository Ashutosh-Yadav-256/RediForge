'use strict';

const CRLF = '\r\n';

function encodeSimpleString(str) {
    return '+' + str + CRLF;
}

function encodeError(msg) {
    return '-' + msg + CRLF;
}

function encodeInteger(num) {
    return ':' + num.toString() + CRLF;
}

function encodeBulkString(str) {
    if (str === null || str === undefined) {
        return '$-1' + CRLF;
    }
    if (Buffer.isBuffer(str)) {
        return Buffer.concat([
            Buffer.from('$' + str.length + CRLF),
            str,
            Buffer.from(CRLF)
        ]);
    }
    const s = typeof str === 'string' ? str : String(str);
    return '$' + Buffer.byteLength(s) + CRLF + s + CRLF;
}

function encodeArray(items) {
    if (items === null || items === undefined) {
        return '*-1' + CRLF;
    }
    const chunks = [];
    chunks.push(Buffer.from('*' + items.length + CRLF));
    let hasBuffer = false;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let encoded;
        if (item === null || item === undefined) {
            encoded = '$-1' + CRLF;
        } else if (typeof item === 'number' || typeof item === 'bigint') {
            encoded = encodeInteger(item);
        } else if (Array.isArray(item)) {
            encoded = encodeArray(item);
        } else {
            encoded = encodeBulkString(item);
        }

        if (Buffer.isBuffer(encoded)) {
            hasBuffer = true;
            chunks.push(encoded);
        } else {
            chunks.push(Buffer.from(encoded));
        }
    }

    if (hasBuffer) {
        return Buffer.concat(chunks);
    }
    return Buffer.concat(chunks).toString('utf8');
}

function ok() {
    return encodeSimpleString('OK');
}

function pong() {
    return encodeSimpleString('PONG');
}

function queued() {
    return encodeSimpleString('QUEUED');
}

function nullBulk() {
    return '$-1' + CRLF;
}

function nullArray() {
    return '*-1' + CRLF;
}

function emptyArray() {
    return '*0' + CRLF;
}

function wrongType() {
    return encodeError('WRONGTYPE Operation against a key holding the wrong kind of value');
}

function syntaxError() {
    return encodeError('ERR syntax error');
}

function wrongArgCount(cmd) {
    return encodeError("ERR wrong number of arguments for '" + cmd + "' command");
}

function unknownCommand(cmd, args) {
    const count = args ? args.length + 1 : 1;
    return encodeError("ERR unknown command '" + cmd + "', with args beginning with: " +
        (args && args.length > 0 ? args.slice(0, 3).map(a => "'" + a + "'").join(' ') : ''));
}

function integerReply(n) {
    return encodeInteger(n);
}

function oom() {
    return encodeError("OOM command not allowed when used memory > 'maxmemory'.");
}

module.exports = {
    encodeSimpleString,
    encodeError,
    encodeInteger,
    encodeBulkString,
    encodeArray,
    ok,
    pong,
    queued,
    nullBulk,
    nullArray,
    emptyArray,
    wrongType,
    syntaxError,
    wrongArgCount,
    unknownCommand,
    integerReply,
    oom
};
