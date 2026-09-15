'use strict';

var INT_MAX = 9007199254740991;
var INT_MIN = -9007199254740991;

var INT64_MAX = 9223372036854775807n;
var INT64_MIN = -9223372036854775808n;

function strictParseInt(str) {
    if (typeof str !== 'string' || str.length === 0) return null;
    if (!/^-?\d+$/.test(str)) return null;
    var val = Number(str);
    if (val > INT_MAX || val < INT_MIN) return null;
    return val;
}

function strictParseBigInt(str) {
    if (str === null || str === undefined) return null;
    if (typeof str === 'number' || typeof str === 'bigint') {
        try {
            var v = BigInt(str);
            if (v > INT64_MAX || v < INT64_MIN) return null;
            return v;
        } catch (e) {
            return null;
        }
    }
    if (typeof str !== 'string' || str.length === 0) return null;
    if (!/^-?\d+$/.test(str)) return null;
    try {
        var val = BigInt(str);
        if (val > INT64_MAX || val < INT64_MIN) return null;
        return val;
    } catch (e) {
        return null;
    }
}

function strictParseFloat(str) {
    if (typeof str !== 'string' || str.length === 0) return null;
    if (str === 'inf' || str === '+inf') return Infinity;
    if (str === '-inf') return -Infinity;
    if (!/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(str)) return null;
    var val = Number(str);
    if (isNaN(val)) return null;
    return val;
}

module.exports = {
    strictParseInt,
    strictParseBigInt,
    strictParseFloat,
    INT_MAX,
    INT_MIN,
    INT64_MAX,
    INT64_MIN
};
