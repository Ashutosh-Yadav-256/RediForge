'use strict';

var encoder = require('../protocol/encoder');
var TYPE_HASH = require('../datastore/store').TYPE_HASH;
var validate = require('../utils/validate');

function cmdHset(args, ctx) {
    if (args.length < 3 || (args.length - 1) % 2 !== 0) return encoder.wrongArgCount('hset');

    var pairs = [];
    for (var i = 1; i < args.length; i += 2) {
        pairs.push([args[i], args[i + 1]]);
    }

    var res = ctx.store.hashSet(ctx.db, args[0], pairs);
    if (!res.ok) {
        if (res.err === 'WRONGTYPE') return encoder.wrongType();
        return encoder.oom();
    }
    return encoder.integerReply(res.added);
}

function cmdHget(args, ctx) {
    if (args.length !== 2) return encoder.wrongArgCount('hget');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var map = ctx.store.get(ctx.db, args[0]);
    if (!map) return encoder.nullBulk();

    var val = map.get(args[1]);
    if (val === undefined) return encoder.nullBulk();
    return encoder.encodeBulkString(val);
}

function cmdHdel(args, ctx) {
    if (args.length < 2) return encoder.wrongArgCount('hdel');

    var fields = [];
    for (var i = 1; i < args.length; i++) {
        fields.push(args[i]);
    }

    var res = ctx.store.hashDelete(ctx.db, args[0], fields);
    if (!res.ok) return encoder.wrongType();
    return encoder.integerReply(res.removed);
}

function cmdHgetall(args, ctx) {
    if (args.length !== 1) return encoder.wrongArgCount('hgetall');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var map = ctx.store.get(ctx.db, args[0]);
    if (!map || map.size === 0) return encoder.emptyArray();

    var result = [];
    for (var entry of map) {
        result.push(entry[0]);
        result.push(entry[1]);
    }

    return encoder.encodeArray(result);
}

function cmdHmset(args, ctx) {
    if (args.length < 3 || (args.length - 1) % 2 !== 0) return encoder.wrongArgCount('hmset');

    var pairs = [];
    for (var i = 1; i < args.length; i += 2) {
        pairs.push([args[i], args[i + 1]]);
    }

    var res = ctx.store.hashSet(ctx.db, args[0], pairs);
    if (!res.ok) {
        if (res.err === 'WRONGTYPE') return encoder.wrongType();
        return encoder.oom();
    }
    return encoder.ok();
}

function cmdHmget(args, ctx) {
    if (args.length < 2) return encoder.wrongArgCount('hmget');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var map = ctx.store.get(ctx.db, args[0]);
    var result = [];

    for (var i = 1; i < args.length; i++) {
        if (map) {
            var val = map.get(args[i]);
            result.push(val !== undefined ? val : null);
        } else {
            result.push(null);
        }
    }

    return encoder.encodeArray(result);
}

function cmdHexists(args, ctx) {
    if (args.length !== 2) return encoder.wrongArgCount('hexists');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var map = ctx.store.get(ctx.db, args[0]);
    if (!map) return encoder.integerReply(0);
    return encoder.integerReply(map.has(args[1]) ? 1 : 0);
}

function cmdHlen(args, ctx) {
    if (args.length !== 1) return encoder.wrongArgCount('hlen');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var map = ctx.store.get(ctx.db, args[0]);
    return encoder.integerReply(map ? map.size : 0);
}

function cmdHkeys(args, ctx) {
    if (args.length !== 1) return encoder.wrongArgCount('hkeys');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var map = ctx.store.get(ctx.db, args[0]);
    if (!map || map.size === 0) return encoder.emptyArray();
    return encoder.encodeArray(Array.from(map.keys()));
}

function cmdHvals(args, ctx) {
    if (args.length !== 1) return encoder.wrongArgCount('hvals');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var map = ctx.store.get(ctx.db, args[0]);
    if (!map || map.size === 0) return encoder.emptyArray();
    return encoder.encodeArray(Array.from(map.values()));
}

function cmdHincrby(args, ctx) {
    if (args.length !== 3) return encoder.wrongArgCount('hincrby');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var increment = validate.strictParseBigInt(args[2]);
    if (increment === null) return encoder.encodeError('ERR value is not an integer or out of range');

    var map = ctx.store.get(ctx.db, args[0]);
    var current = map ? map.get(args[1]) : undefined;
    var currentBig;
    if (current === undefined) {
        currentBig = 0n;
    } else {
        currentBig = validate.strictParseBigInt(current);
        if (currentBig === null) return encoder.encodeError('ERR hash value is not an integer');
    }

    var result = currentBig + increment;
    if (result > validate.INT64_MAX || result < validate.INT64_MIN) {
        return encoder.encodeError('ERR increment or decrement would overflow');
    }

    var res = ctx.store.hashSet(ctx.db, args[0], [[args[1], result.toString()]]);
    if (!res.ok) {
        if (res.err === 'WRONGTYPE') return encoder.wrongType();
        return encoder.oom();
    }

    return encoder.integerReply(result);
}

function cmdHincrbyfloat(args, ctx) {
    if (args.length !== 3) return encoder.wrongArgCount('hincrbyfloat');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var increment = validate.strictParseFloat(args[2]);
    if (increment === null || !isFinite(increment)) return encoder.encodeError('ERR value is not a valid float');

    var map = ctx.store.get(ctx.db, args[0]);
    var current = map ? map.get(args[1]) : undefined;
    var currentNum;
    if (current === undefined) {
        currentNum = 0;
    } else {
        currentNum = validate.strictParseFloat(current);
        if (currentNum === null || !isFinite(currentNum)) return encoder.encodeError('ERR hash value is not a float');
    }

    var result = currentNum + increment;
    if (!isFinite(result)) return encoder.encodeError('ERR increment would produce NaN or Infinity');
    var strResult = String(result);

    var res = ctx.store.hashSet(ctx.db, args[0], [[args[1], strResult]]);
    if (!res.ok) {
        if (res.err === 'WRONGTYPE') return encoder.wrongType();
        return encoder.oom();
    }

    return encoder.encodeBulkString(strResult);
}

function cmdHsetnx(args, ctx) {
    if (args.length !== 3) return encoder.wrongArgCount('hsetnx');
    if (!ctx.store.checkType(ctx.db, args[0], TYPE_HASH)) return encoder.wrongType();

    var map = ctx.store.get(ctx.db, args[0]);
    if (map && map.has(args[1])) return encoder.integerReply(0);

    var res = ctx.store.hashSet(ctx.db, args[0], [[args[1], args[2]]]);
    if (!res.ok) {
        if (res.err === 'WRONGTYPE') return encoder.wrongType();
        return encoder.oom();
    }
    return encoder.integerReply(1);
}

module.exports = {
    hset: cmdHset,
    hget: cmdHget,
    hdel: cmdHdel,
    hgetall: cmdHgetall,
    hmset: cmdHmset,
    hmget: cmdHmget,
    hexists: cmdHexists,
    hlen: cmdHlen,
    hkeys: cmdHkeys,
    hvals: cmdHvals,
    hincrby: cmdHincrby,
    hincrbyfloat: cmdHincrbyfloat,
    hsetnx: cmdHsetnx
};
