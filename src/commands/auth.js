'use strict';

var crypto = require('crypto');
var encoder = require('../protocol/encoder');

function timingSafeEqual(a, b) {
    var bufA = Buffer.from(String(a));
    var bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

function cmdAuth(args, ctx) {
    if (args.length < 1 || args.length > 2) return encoder.wrongArgCount('auth');

    var password = args.length === 2 ? args[1] : args[0];
    var username = args.length === 2 ? args[0] : 'default';

    var pass = ctx.config ? ctx.config.get('requirepass') : null;

    if (!pass || pass.length === 0) {
        return encoder.encodeError('ERR Client sent AUTH, but no password is set');
    }

    if (username === 'default' && timingSafeEqual(password, pass)) {
        if (ctx.connection) {
            ctx.connection.authenticated = true;
            ctx.connection.username = username;
        }
        return encoder.ok();
    }

    return encoder.encodeError('WRONGPASS invalid username-password pair or user is disabled');
}

module.exports = {
    auth: cmdAuth
};
