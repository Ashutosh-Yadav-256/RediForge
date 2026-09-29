'use strict';

var ExpiryManager = require('./expiry').ExpiryManager;
var LRUEviction = require('./lru').LRUEviction;
var Deque = require('../structures/deque').Deque;
var SortedSet = require('../structures/zset').SortedSet;

var TYPE_STRING = 'string';
var TYPE_LIST = 'list';
var TYPE_SET = 'set';
var TYPE_ZSET = 'zset';
var TYPE_HASH = 'hash';

function estimateMemory(key, value, type) {
    var bytes = Buffer.byteLength(String(key)) + 48;
    if (value === undefined || value === null) return bytes;

    if (type === TYPE_STRING || typeof value === 'string' || Buffer.isBuffer(value)) {
        var strLen = Buffer.isBuffer(value) ? value.length : Buffer.byteLength(String(value));
        bytes += strLen + 16;
    } else if (type === TYPE_HASH && value instanceof Map) {
        bytes += 48;
        for (var entry of value) {
            bytes += Buffer.byteLength(String(entry[0])) + Buffer.byteLength(String(entry[1])) + 48;
        }
    } else if (type === TYPE_LIST) {
        bytes += 48;
        if (value && typeof value.get === 'function') {
            for (var i = 0; i < value.length; i++) {
                var el = value.get(i);
                bytes += (Buffer.isBuffer(el) ? el.length : Buffer.byteLength(String(el))) + 32;
            }
        } else if (Array.isArray(value)) {
            for (var i = 0; i < value.length; i++) {
                bytes += (Buffer.isBuffer(value[i]) ? value[i].length : Buffer.byteLength(String(value[i]))) + 32;
            }
        }
    } else if (type === TYPE_SET && value instanceof Set) {
        bytes += 48;
        for (var item of value) {
            bytes += Buffer.byteLength(String(item)) + 32;
        }
    } else if (type === TYPE_ZSET) {
        bytes += 48;
        if (value && value.dict instanceof Map) {
            for (var zEntry of value.dict) {
                bytes += Buffer.byteLength(String(zEntry[0])) + 48;
            }
        } else if (value && value.members instanceof Map) {
            for (var zEntry of value.members) {
                bytes += Buffer.byteLength(String(zEntry[0])) + 48;
            }
        } else if (Array.isArray(value)) {
            for (var j = 0; j < value.length; j++) {
                var m = value[j];
                bytes += Buffer.byteLength(String(m.member || '')) + 48;
            }
        }
    } else {
        bytes += 32;
    }
    return bytes;
}

function insertSorted(zs, member, score) {
    var lo = 0;
    var hi = zs.sorted.length;
    while (lo < hi) {
        var mid = (lo + hi) >>> 1;
        var cmp = zs.sorted[mid].score - score;
        if (cmp < 0 || (cmp === 0 && zs.sorted[mid].member < member)) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    zs.sorted.splice(lo, 0, { member: member, score: score });
}

function removeSorted(zs, member) {
    var idx = -1;
    for (var i = 0; i < zs.sorted.length; i++) {
        if (zs.sorted[i].member === member) { idx = i; break; }
    }
    if (idx >= 0) zs.sorted.splice(idx, 1);
}

function DataStore(dbCount, config) {
    this.dbCount = dbCount || 16;
    this._config = config || null;
    this._dbs = [];
    this._types = [];
    this._keyMemories = [];
    this._usedMemory = 0;
    this._dbVersions = [];
    this._globalVersion = 0;
    for (var i = 0; i < this.dbCount; i++) {
        this._dbs.push(new Map());
        this._types.push(new Map());
        this._keyMemories.push(new Map());
        this._dbVersions.push(0);
    }
    this.expiry = new ExpiryManager();
    this.lru = new LRUEviction(5);
    this._dirty = 0;
    this._watchedKeys = new Map();
    this._keyVersions = new Map();
    this._restoring = false;
    this.mutationEngine = null;
}

DataStore.prototype.setMutationEngine = function (mutationEngine) {
    this.mutationEngine = mutationEngine;
};

DataStore.prototype._recordMutation = function (db, command, args) {
    if (this._restoring) return null;
    if (this.mutationEngine && typeof this.mutationEngine.record === 'function') {
        return this.mutationEngine.record(db, command, args);
    }
    return null;
};

Object.defineProperty(DataStore.prototype, 'usedMemory', {
    get: function () { return this._usedMemory; }
});

DataStore.prototype._checkExpired = function (db, key) {
    if (this.expiry.isExpired(db, key)) {
        this.deleteKey(db, key);
        return true;
    }
    return false;
};

DataStore.prototype.get = function (db, key) {
    this._checkExpired(db, key);
    var val = this._dbs[db].get(key);
    if (val !== undefined) {
        this.lru.touch(db, key);
    }
    return val;
};

DataStore.prototype.set = function (db, key, value, type) {
    var itemType = type || TYPE_STRING;
    var newMem = estimateMemory(key, value, itemType);
    var oldMem = this._keyMemories[db].get(key) || 0;
    var memDelta = newMem - oldMem;

    if (!this._restoring && this._config) {
        var rejected = this.enforceMemoryLimit(memDelta);
        if (rejected) return false;
    }

    this._dbs[db].set(key, value);
    this._types[db].set(key, itemType);
    this._keyMemories[db].set(key, newMem);
    this._usedMemory = Math.max(0, this._usedMemory + memDelta);

    this.lru.touch(db, key);
    if (!this._restoring) {
        this._dirty++;
        this._bumpKeyVersion(db, key);
        this._recordMutation(db, 'SET', [key, value]);
    }
    return true;
};

DataStore.prototype.markDirty = function (db, key) {
    var val = this._dbs[db].get(key);
    var type = this._types[db].get(key);
    if (val !== undefined) {
        var newMem = estimateMemory(key, val, type);
        var oldMem = this._keyMemories[db].get(key) || 0;
        this._usedMemory = Math.max(0, this._usedMemory + (newMem - oldMem));
        this._keyMemories[db].set(key, newMem);
    }
    this._dirty++;
    this._bumpKeyVersion(db, key);
    this.lru.touch(db, key);
};

DataStore.prototype.deleteKey = function (db, key) {
    var existed = this._dbs[db].delete(key);
    this._types[db].delete(key);
    this.expiry.removeExpiry(db, key);
    this.lru.remove(db, key);

    var oldMem = this._keyMemories[db].get(key) || 0;
    this._keyMemories[db].delete(key);
    this._usedMemory = Math.max(0, this._usedMemory - oldMem);

    if (existed) {
        this._dirty++;
        this._bumpKeyVersion(db, key);
        this._recordMutation(db, 'DEL', [key]);
    }
    return existed;
};

DataStore.prototype.exists = function (db, key) {
    this._checkExpired(db, key);
    return this._dbs[db].has(key);
};

DataStore.prototype.typeOf = function (db, key) {
    this._checkExpired(db, key);
    return this._types[db].get(key) || 'none';
};

DataStore.prototype.checkType = function (db, key, expected) {
    var actual = this.typeOf(db, key);
    if (actual === 'none') return true;
    return actual === expected;
};

DataStore.prototype.keysInDb = function (db) {
    var out = [];
    for (var key of this._dbs[db].keys()) {
        if (!this._checkExpired(db, key)) {
            out.push(key);
        }
    }
    return out;
};

DataStore.prototype.dbSize = function (db) {
    return this.keysInDb(db).length;
};

DataStore.prototype.flushDb = function (db) {
    var dbMem = 0;
    for (var m of this._keyMemories[db].values()) {
        dbMem += m;
    }
    this._usedMemory = Math.max(0, this._usedMemory - dbMem);

    this._dbs[db].clear();
    this._types[db].clear();
    this._keyMemories[db].clear();
    this.expiry.clearDb(db);
    this.lru.clearDb(db);
    this._dbVersions[db]++;
    this._dirty++;
    this._recordMutation(db, 'FLUSHDB', []);
};

DataStore.prototype.flushAll = function () {
    for (var i = 0; i < this.dbCount; i++) {
        this._dbs[i].clear();
        this._types[i].clear();
        this._keyMemories[i].clear();
        this._dbVersions[i]++;
    }
    this._usedMemory = 0;
    this.expiry.clearAll();
    this.lru.clearAll();
    this._globalVersion++;
    this._dirty++;
    this._recordMutation(0, 'FLUSHALL', []);
};

DataStore.prototype.swapDb = function (a, b) {
    if (a < 0 || a >= this.dbCount || b < 0 || b >= this.dbCount) {
        return false;
    }
    var tmpDb = this._dbs[a];
    var tmpType = this._types[a];
    var tmpMem = this._keyMemories[a];
    var tmpVer = this._dbVersions[a];

    this._dbs[a] = this._dbs[b];
    this._types[a] = this._types[b];
    this._keyMemories[a] = this._keyMemories[b];
    this._dbVersions[a] = (this._dbVersions[b] || 0) + 1;

    this._dbs[b] = tmpDb;
    this._types[b] = tmpType;
    this._keyMemories[b] = tmpMem;
    this._dbVersions[b] = (tmpVer || 0) + 1;

    this.expiry.swapDb(a, b);
    this.lru.swapDb(a, b);
    this._dirty++;
    return true;
};

DataStore.prototype.randomKey = function (db) {
    var keys = this.keysInDb(db);
    if (keys.length === 0) return null;
    return keys[Math.floor(Math.random() * keys.length)];
};

DataStore.prototype.rename = function (db, from, to) {
    this._checkExpired(db, from);
    this._checkExpired(db, to);
    if (!this._dbs[db].has(from)) return false;
    if (from === to) return true;

    var value = this._dbs[db].get(from);
    var type = this._types[db].get(from);
    var expiryDeadline = this.expiry.getExpiry(db, from);

    var fromMem = this._keyMemories[db].get(from) || 0;
    var toExistingMem = this._keyMemories[db].get(to) || 0;
    var newToMem = estimateMemory(to, value, type);
    var netDelta = newToMem - toExistingMem - fromMem;

    if (!this._restoring && this._config && netDelta > 0) {
        var rejected = this.enforceMemoryLimit(netDelta);
        if (rejected) {
            return { ok: false, err: 'OOM' };
        }
    }

    if (this._dbs[db].has(to)) {
        this.expiry.removeExpiry(db, to);
        this.lru.remove(db, to);
    }

    this._dbs[db].delete(from);
    this._types[db].delete(from);
    this._keyMemories[db].delete(from);
    this.expiry.removeExpiry(db, from);
    this.lru.remove(db, from);

    this._dbs[db].set(to, value);
    this._types[db].set(to, type);
    this._keyMemories[db].set(to, newToMem);
    this.lru.touch(db, to);

    if (expiryDeadline > 0) {
        this.expiry.setExpireAt(db, to, expiryDeadline);
    }

    this._usedMemory = Math.max(0, this._usedMemory + netDelta);
    this._bumpKeyVersion(db, from);
    this._bumpKeyVersion(db, to);
    this._dirty++;
    this._recordMutation(db, 'RENAME', [from, to]);

    return true;
};

DataStore.prototype.renameKey = DataStore.prototype.rename;

DataStore.prototype.listPushLeft = function (db, key, elements) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_LIST)) return { ok: false, err: 'WRONGTYPE' };

    var list = this._dbs[db].get(key);
    var memDelta = 0;
    if (list === undefined) {
        memDelta = estimateMemory(key, null, TYPE_LIST) + 48;
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            memDelta += (Buffer.isBuffer(el) ? el.length : Buffer.byteLength(String(el))) + 32;
        }
    } else {
        for (var j = 0; j < elements.length; j++) {
            var el2 = elements[j];
            memDelta += (Buffer.isBuffer(el2) ? el2.length : Buffer.byteLength(String(el2))) + 32;
        }
    }

    if (!this._restoring && this._config && memDelta > 0) {
        if (this.enforceMemoryLimit(memDelta)) return { ok: false, err: 'OOM' };
    }

    if (list === undefined) {
        list = new Deque();
        this._dbs[db].set(key, list);
        this._types[db].set(key, TYPE_LIST);
    } else if (Array.isArray(list)) {
        var dq = new Deque(list.length + elements.length);
        for (var e of list) dq.pushRight(e);
        list = dq;
        this._dbs[db].set(key, list);
    }

    for (var k = 0; k < elements.length; k++) {
        list.pushLeft(elements[k]);
    }

    var oldMem = this._keyMemories[db].get(key) || 0;
    this._keyMemories[db].set(key, oldMem + memDelta);
    this._usedMemory = Math.max(0, this._usedMemory + memDelta);

    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;
    this._recordMutation(db, 'LPUSH', [key].concat(elements));

    return { ok: true, length: list.length };
};

DataStore.prototype.listPushRight = function (db, key, elements) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_LIST)) return { ok: false, err: 'WRONGTYPE' };

    var list = this._dbs[db].get(key);
    var memDelta = 0;
    if (list === undefined) {
        memDelta = estimateMemory(key, null, TYPE_LIST) + 48;
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            memDelta += (Buffer.isBuffer(el) ? el.length : Buffer.byteLength(String(el))) + 32;
        }
    } else {
        for (var j = 0; j < elements.length; j++) {
            var el2 = elements[j];
            memDelta += (Buffer.isBuffer(el2) ? el2.length : Buffer.byteLength(String(el2))) + 32;
        }
    }

    if (!this._restoring && this._config && memDelta > 0) {
        if (this.enforceMemoryLimit(memDelta)) return { ok: false, err: 'OOM' };
    }

    if (list === undefined) {
        list = new Deque();
        this._dbs[db].set(key, list);
        this._types[db].set(key, TYPE_LIST);
    } else if (Array.isArray(list)) {
        var dq = new Deque(list.length + elements.length);
        for (var e of list) dq.pushRight(e);
        list = dq;
        this._dbs[db].set(key, list);
    }

    for (var k = 0; k < elements.length; k++) {
        list.pushRight(elements[k]);
    }

    var oldMem = this._keyMemories[db].get(key) || 0;
    this._keyMemories[db].set(key, oldMem + memDelta);
    this._usedMemory = Math.max(0, this._usedMemory + memDelta);

    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;
    this._recordMutation(db, 'RPUSH', [key].concat(elements));

    return { ok: true, length: list.length };
};

DataStore.prototype.listPopLeft = function (db, key, count) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_LIST)) return { ok: false, err: 'WRONGTYPE' };

    var list = this._dbs[db].get(key);
    if (!list || list.length === 0) return { ok: true, values: [] };

    var popCount = Math.min(count !== undefined ? count : 1, list.length);
    var popped = [];
    var freedBytes = 0;

    for (var i = 0; i < popCount; i++) {
        var val = typeof list.popLeft === 'function' ? list.popLeft() : list.shift();
        popped.push(val);
        freedBytes += (Buffer.isBuffer(val) ? val.length : Buffer.byteLength(String(val))) + 32;
    }

    if (list.length === 0) {
        this.deleteKey(db, key);
    } else {
        var oldMem = this._keyMemories[db].get(key) || 0;
        this._keyMemories[db].set(key, Math.max(0, oldMem - freedBytes));
        this._usedMemory = Math.max(0, this._usedMemory - freedBytes);
        this.lru.touch(db, key);
        this._bumpKeyVersion(db, key);
        this._dirty++;
    }

    if (popped.length > 0) {
        var popLeftArgs = count > 1 ? [key, String(count)] : [key];
        this._recordMutation(db, 'LPOP', popLeftArgs);
    }

    return { ok: true, values: popped };
};

DataStore.prototype.listPopRight = function (db, key, count) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_LIST)) return { ok: false, err: 'WRONGTYPE' };

    var list = this._dbs[db].get(key);
    if (!list || list.length === 0) return { ok: true, values: [] };

    var popCount = Math.min(count !== undefined ? count : 1, list.length);
    var popped = [];
    var freedBytes = 0;

    for (var i = 0; i < popCount; i++) {
        var val = typeof list.popRight === 'function' ? list.popRight() : list.pop();
        popped.push(val);
        freedBytes += (Buffer.isBuffer(val) ? val.length : Buffer.byteLength(String(val))) + 32;
    }

    if (list.length === 0) {
        this.deleteKey(db, key);
    } else {
        var oldMem = this._keyMemories[db].get(key) || 0;
        this._keyMemories[db].set(key, Math.max(0, oldMem - freedBytes));
        this._usedMemory = Math.max(0, this._usedMemory - freedBytes);
        this.lru.touch(db, key);
        this._bumpKeyVersion(db, key);
        this._dirty++;
    }

    if (popped.length > 0) {
        var popRightArgs = count > 1 ? [key, String(count)] : [key];
        this._recordMutation(db, 'RPOP', popRightArgs);
    }

    return { ok: true, values: popped };
};

DataStore.prototype.hashSet = function (db, key, fieldValues) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_HASH)) return { ok: false, err: 'WRONGTYPE' };

    var map = this._dbs[db].get(key);
    var added = 0;
    var memDelta = 0;

    if (map === undefined) {
        memDelta = estimateMemory(key, null, TYPE_HASH) + 48;
        var seenNew = new Set();
        for (var i = 0; i < fieldValues.length; i++) {
            var f = String(fieldValues[i][0]);
            var v = String(fieldValues[i][1]);
            if (!seenNew.has(f)) {
                seenNew.add(f);
                added++;
                memDelta += Buffer.byteLength(f) + Buffer.byteLength(v) + 48;
            }
        }
    } else {
        var simulated = new Map();
        for (var j = 0; j < fieldValues.length; j++) {
            var fld = String(fieldValues[j][0]);
            var val = String(fieldValues[j][1]);
            var newBytes = Buffer.byteLength(fld) + Buffer.byteLength(val) + 48;

            if (simulated.has(fld)) {
                var prevBytes = simulated.get(fld);
                memDelta += (newBytes - prevBytes);
                simulated.set(fld, newBytes);
            } else if (map.has(fld)) {
                var oldVal = map.get(fld);
                var oldBytes = Buffer.byteLength(fld) + Buffer.byteLength(String(oldVal)) + 48;
                memDelta += (newBytes - oldBytes);
                simulated.set(fld, newBytes);
            } else {
                added++;
                memDelta += newBytes;
                simulated.set(fld, newBytes);
            }
        }
    }

    if (!this._restoring && this._config && memDelta > 0) {
        if (this.enforceMemoryLimit(memDelta)) return { ok: false, err: 'OOM' };
    }

    if (map === undefined) {
        map = new Map();
        this._dbs[db].set(key, map);
        this._types[db].set(key, TYPE_HASH);
    }

    for (var k = 0; k < fieldValues.length; k++) {
        map.set(String(fieldValues[k][0]), String(fieldValues[k][1]));
    }

    var oldMem = this._keyMemories[db].get(key) || 0;
    this._keyMemories[db].set(key, Math.max(0, oldMem + memDelta));
    this._usedMemory = Math.max(0, this._usedMemory + memDelta);

    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;

    var flatHashArgs = [key];
    for (var fIdx = 0; fIdx < fieldValues.length; fIdx++) {
        flatHashArgs.push(String(fieldValues[fIdx][0]), String(fieldValues[fIdx][1]));
    }
    this._recordMutation(db, 'HSET', flatHashArgs);

    return { ok: true, added: added };
};

DataStore.prototype.hashDelete = function (db, key, fields) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_HASH)) return { ok: false, err: 'WRONGTYPE' };

    var map = this._dbs[db].get(key);
    if (!map) return { ok: true, removed: 0 };

    var removed = 0;
    var freedBytes = 0;

    for (var i = 0; i < fields.length; i++) {
        var f = String(fields[i]);
        if (map.has(f)) {
            var val = map.get(f);
            freedBytes += Buffer.byteLength(f) + Buffer.byteLength(String(val)) + 48;
            map.delete(f);
            removed++;
        }
    }

    if (removed > 0) {
        if (map.size === 0) {
            this.deleteKey(db, key);
        } else {
            var oldMem = this._keyMemories[db].get(key) || 0;
            this._keyMemories[db].set(key, Math.max(0, oldMem - freedBytes));
            this._usedMemory = Math.max(0, this._usedMemory - freedBytes);
            this.lru.touch(db, key);
            this._bumpKeyVersion(db, key);
            this._dirty++;
        }
        this._recordMutation(db, 'HDEL', [key].concat(fields));
    }

    return { ok: true, removed: removed };
};

DataStore.prototype.setAdd = function (db, key, members) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_SET)) return { ok: false, err: 'WRONGTYPE' };

    var set = this._dbs[db].get(key);
    var added = 0;
    var memDelta = 0;

    if (set === undefined) {
        memDelta = estimateMemory(key, null, TYPE_SET) + 48;
        var unique = new Set();
        for (var i = 0; i < members.length; i++) {
            var m = String(members[i]);
            if (!unique.has(m)) {
                unique.add(m);
                added++;
                memDelta += Buffer.byteLength(m) + 32;
            }
        }
    } else {
        var seen = new Set();
        for (var j = 0; j < members.length; j++) {
            var mem = String(members[j]);
            if (!set.has(mem) && !seen.has(mem)) {
                seen.add(mem);
                added++;
                memDelta += Buffer.byteLength(mem) + 32;
            }
        }
    }

    if (!this._restoring && this._config && memDelta > 0) {
        if (this.enforceMemoryLimit(memDelta)) return { ok: false, err: 'OOM' };
    }

    if (set === undefined) {
        set = new Set();
        this._dbs[db].set(key, set);
        this._types[db].set(key, TYPE_SET);
    }

    for (var k = 0; k < members.length; k++) {
        set.add(String(members[k]));
    }

    var oldMem = this._keyMemories[db].get(key) || 0;
    this._keyMemories[db].set(key, oldMem + memDelta);
    this._usedMemory = Math.max(0, this._usedMemory + memDelta);

    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;
    this._recordMutation(db, 'SADD', [key].concat(members));

    return { ok: true, added: added };
};

DataStore.prototype.setRemove = function (db, key, members) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_SET)) return { ok: false, err: 'WRONGTYPE' };

    var set = this._dbs[db].get(key);
    if (!set) return { ok: true, removed: 0 };

    var removed = 0;
    var freedBytes = 0;

    for (var i = 0; i < members.length; i++) {
        var m = String(members[i]);
        if (set.has(m)) {
            set.delete(m);
            removed++;
            freedBytes += Buffer.byteLength(m) + 32;
        }
    }

    if (removed > 0) {
        if (set.size === 0) {
            this.deleteKey(db, key);
        } else {
            var oldMem = this._keyMemories[db].get(key) || 0;
            this._keyMemories[db].set(key, Math.max(0, oldMem - freedBytes));
            this._usedMemory = Math.max(0, this._usedMemory - freedBytes);
            this.lru.touch(db, key);
            this._bumpKeyVersion(db, key);
            this._dirty++;
        }
        this._recordMutation(db, 'SREM', [key].concat(members));
    }

    return { ok: true, removed: removed };
};

DataStore.prototype.zsetAdd = function (db, key, items, flags) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_ZSET)) return { ok: false, err: 'WRONGTYPE' };

    flags = flags || {};
    var zs = this._dbs[db].get(key);
    var added = 0;
    var changed = 0;
    var memDelta = 0;

    var actions = [];
    var simMembers = zs ? (zs instanceof SortedSet ? new Map(zs.dict) : new Map(zs.members)) : new Map();

    for (var i = 0; i < items.length; i++) {
        var member = String(items[i].member);
        var score = items[i].score;

        if (simMembers.has(member)) {
            if (flags.nx) continue;
            var oldScore = simMembers.get(member);
            var doUpdate = true;
            if (flags.gt && score <= oldScore) doUpdate = false;
            if (flags.lt && score >= oldScore) doUpdate = false;

            if (doUpdate && score !== oldScore) {
                simMembers.set(member, score);
                actions.push({ type: 'update', member: member, score: score });
                changed++;
            }
        } else {
            if (flags.xx) continue;
            simMembers.set(member, score);
            actions.push({ type: 'add', member: member, score: score });
            added++;
            memDelta += Buffer.byteLength(member) + 48;
        }
    }

    if (zs === undefined && added > 0) {
        memDelta += estimateMemory(key, null, TYPE_ZSET) + 48;
    }

    if (!this._restoring && this._config && memDelta > 0) {
        if (this.enforceMemoryLimit(memDelta)) return { ok: false, err: 'OOM' };
    }

    if (zs === undefined) {
        zs = new SortedSet();
        this._dbs[db].set(key, zs);
        this._types[db].set(key, TYPE_ZSET);
    } else if (!(zs instanceof SortedSet) && zs.members) {
        var newZs = new SortedSet();
        for (var [m, s] of zs.members) newZs.add(m, s);
        zs = newZs;
        this._dbs[db].set(key, zs);
    }

    for (var j = 0; j < actions.length; j++) {
        var act = actions[j];
        zs.add(act.member, act.score);
    }

    var oldMem = this._keyMemories[db].get(key) || 0;
    this._keyMemories[db].set(key, oldMem + memDelta);
    this._usedMemory = Math.max(0, this._usedMemory + memDelta);

    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;

    var zArgs = [key];
    for (var za = 0; za < items.length; za++) {
        zArgs.push(String(items[za].score), String(items[za].member));
    }
    this._recordMutation(db, 'ZADD', zArgs);

    return { ok: true, added: added, changed: changed };
};

DataStore.prototype.zsetRemove = function (db, key, members) {
    this._checkExpired(db, key);
    if (!this.checkType(db, key, TYPE_ZSET)) return { ok: false, err: 'WRONGTYPE' };

    var zs = this._dbs[db].get(key);
    if (!zs) return { ok: true, removed: 0 };

    var removed = 0;
    var freedBytes = 0;

    for (var i = 0; i < members.length; i++) {
        var m = String(members[i]);
        var hasMem = typeof zs.has === 'function' ? zs.has(m) : (zs.members && zs.members.has(m));
        if (hasMem) {
            if (typeof zs.remove === 'function') {
                zs.remove(m);
            } else {
                removeSorted(zs, m);
                zs.members.delete(m);
            }
            removed++;
            freedBytes += Buffer.byteLength(m) + 48;
        }
    }

    if (removed > 0) {
        var remaining = typeof zs.size === 'number' ? zs.size : (zs.members ? zs.members.size : 0);
        if (remaining === 0) {
            this.deleteKey(db, key);
        } else {
            var oldMem = this._keyMemories[db].get(key) || 0;
            this._keyMemories[db].set(key, Math.max(0, oldMem - freedBytes));
            this._usedMemory = Math.max(0, this._usedMemory - freedBytes);
            this.lru.touch(db, key);
            this._bumpKeyVersion(db, key);
            this._dirty++;
        }
        this._recordMutation(db, 'ZREM', [key].concat(members));
    }

    return { ok: true, removed: removed };
};

DataStore.prototype.expire = function (db, key, seconds) {
    if (!this.exists(db, key)) return 0;
    if (seconds <= 0) {
        this.deleteKey(db, key);
        return 1;
    }
    var deadline = Date.now() + seconds * 1000;
    this.expiry.setExpireAt(db, key, deadline);
    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;
    this._recordMutation(db, 'PEXPIREAT', [key, String(deadline)]);
    return 1;
};

DataStore.prototype.pexpire = function (db, key, ms) {
    if (!this.exists(db, key)) return 0;
    if (ms <= 0) {
        this.deleteKey(db, key);
        return 1;
    }
    var deadline = Date.now() + ms;
    this.expiry.setExpireAt(db, key, deadline);
    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;
    this._recordMutation(db, 'PEXPIREAT', [key, String(deadline)]);
    return 1;
};

DataStore.prototype.expireAt = function (db, key, tsSec) {
    if (!this.exists(db, key)) return 0;
    var deadline = tsSec * 1000;
    if (deadline <= Date.now()) {
        this.deleteKey(db, key);
        return 1;
    }
    this.expiry.setExpireAt(db, key, deadline);
    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;
    this._recordMutation(db, 'PEXPIREAT', [key, String(deadline)]);
    return 1;
};

DataStore.prototype.pexpireAt = function (db, key, tsMs) {
    if (!this.exists(db, key)) return 0;
    if (tsMs <= Date.now()) {
        this.deleteKey(db, key);
        return 1;
    }
    this.expiry.setExpireAt(db, key, tsMs);
    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;
    this._recordMutation(db, 'PEXPIREAT', [key, String(tsMs)]);
    return 1;
};

DataStore.prototype.persist = function (db, key) {
    if (!this.exists(db, key)) return 0;
    if (!this.expiry.hasExpiry(db, key)) return 0;
    this.expiry.removeExpiry(db, key);
    this.lru.touch(db, key);
    this._bumpKeyVersion(db, key);
    this._dirty++;
    this._recordMutation(db, 'PERSIST', [key]);
    return 1;
};

DataStore.prototype.enforceMemoryLimit = function (incomingDelta) {
    if (!this._config) return false;
    var maxmem = this._config.get('maxmemory');
    if (!maxmem || maxmem <= 0) return false;

    var totalEstimated = this._usedMemory + (incomingDelta || 0);
    if (totalEstimated <= maxmem) return false;

    var policy = this._config.get('maxmemory_policy') || 'noeviction';
    if (policy === 'noeviction') return true;

    var attempts = 0;
    while (this._usedMemory + (incomingDelta || 0) > maxmem && attempts < 128) {
        var bytesNeeded = (this._usedMemory + (incomingDelta || 0)) - maxmem;
        var freed = this.lru.evict(this, policy, bytesNeeded);
        if (!freed) return true;
        attempts++;
    }

    return (this._usedMemory + (incomingDelta || 0)) > maxmem;
};

Object.defineProperty(DataStore.prototype, 'dirty', {
    get: function () { return this._dirty; }
});

DataStore.prototype.resetDirty = function () {
    this._dirty = 0;
};

DataStore.prototype.watchKey = function (clientId, db, key) {
    var mapKey = db + ':' + key;
    if (!this._watchedKeys.has(clientId)) {
        this._watchedKeys.set(clientId, new Map());
    }
    var version = this._keyVersions.get(mapKey) || 0;
    var dbVer = this._dbVersions[db] || 0;
    this._watchedKeys.get(clientId).set(mapKey, {
        keyVersion: version,
        dbVersion: dbVer,
        globalVersion: this._globalVersion
    });
};

DataStore.prototype.unwatchAll = function (clientId) {
    this._watchedKeys.delete(clientId);
};

DataStore.prototype.isWatchDirty = function (clientId) {
    var watched = this._watchedKeys.get(clientId);
    if (!watched) return false;

    for (var entry of watched) {
        var mapKey = entry[0];
        var saved = entry[1];
        var sep = mapKey.indexOf(':');
        var db = parseInt(mapKey.substring(0, sep), 10);

        var currentKeyVer = this._keyVersions.get(mapKey) || 0;
        var currentDbVer = this._dbVersions[db] || 0;

        if (typeof saved === 'object' && saved !== null) {
            if (currentKeyVer !== saved.keyVersion ||
                currentDbVer !== saved.dbVersion ||
                this._globalVersion !== saved.globalVersion) {
                return true;
            }
        } else {
            if (currentKeyVer !== saved) {
                return true;
            }
        }
    }
    return false;
};

DataStore.prototype._bumpKeyVersion = function (db, key) {
    var mapKey = db + ':' + key;
    var current = this._keyVersions.get(mapKey) || 0;
    this._keyVersions.set(mapKey, current + 1);
};

DataStore.prototype.exportDbData = function (db) {
    var out = [];
    for (var entry of this._dbs[db]) {
        var key = entry[0];
        var value = entry[1];
        if (!this._checkExpired(db, key)) {
            out.push([key, {
                value: value,
                type: this._types[db].get(key)
            }]);
        }
    }
    return out;
};

DataStore.prototype.importDbData = function (db, data) {
    if (Array.isArray(data)) {
        for (var i = 0; i < data.length; i++) {
            var item = data[i];
            this.set(db, item[0], item[1].value, item[1].type);
        }
    } else if (data && typeof data === 'object') {
        for (var key of Object.keys(data)) {
            this.set(db, key, data[key].value, data[key].type);
        }
    }
};

DataStore.prototype.exportSnapshot = function () {
    var databases = {};
    for (var i = 0; i < this.dbCount; i++) {
        var data = this.exportDbData(i);
        if (Array.isArray(data) && data.length > 0) {
            databases[i] = [];
            for (var j = 0; j < data.length; j++) {
                var k = data[j][0];
                var ent = data[j][1];
                var serializedVal = ent.value;
                if (ent.type === 'hash' && ent.value instanceof Map) {
                    serializedVal = Array.from(ent.value.entries());
                } else if (ent.type === 'set' && ent.value instanceof Set) {
                    serializedVal = Array.from(ent.value);
                } else if (ent.type === 'list') {
                    if (ent.value && typeof ent.value.toArray === 'function') {
                        serializedVal = ent.value.toArray();
                    } else if (Array.isArray(ent.value)) {
                        serializedVal = ent.value;
                    }
                } else if (ent.type === 'zset') {
                    if (ent.value && typeof ent.value.range === 'function') {
                        serializedVal = ent.value.range(0, -1, true);
                    } else if (ent.value && ent.value.members instanceof Map) {
                        serializedVal = Array.from(ent.value.members.entries()).map(function (e) {
                            return { member: e[0], score: e[1] };
                        });
                    }
                }
                databases[i].push([k, { type: ent.type, value: serializedVal }]);
            }
        }
    }
    var expiries = this.expiry.exportAll();
    return {
        magic: 'REDISGEN',
        version: 2,
        timestamp: Date.now(),
        databases: databases,
        expiries: expiries
    };
};

DataStore.prototype.importSnapshot = function (snapshot) {
    if (!snapshot || snapshot.magic !== 'REDISGEN') {
        throw new Error('invalid snapshot format');
    }
    this.flushAll();
    this._restoring = true;
    for (var dbIdx in snapshot.databases) {
        var db = parseInt(dbIdx, 10);
        var entries = snapshot.databases[dbIdx];
        if (Array.isArray(entries)) {
            for (var i = 0; i < entries.length; i++) {
                var item = entries[i];
                var key = item[0];
                var entry = item[1];
                var val = entry.value;
                if (entry.type === 'hash' && Array.isArray(val)) {
                    val = new Map(val);
                } else if (entry.type === 'set' && Array.isArray(val)) {
                    val = new Set(val);
                } else if (entry.type === 'list' && Array.isArray(val)) {
                    var deq = new Deque();
                    for (var li = 0; li < val.length; li++) deq.pushRight(val[li]);
                    val = deq;
                } else if (entry.type === 'zset') {
                    var zs = new SortedSet();
                    if (Array.isArray(val)) {
                        for (var zi = 0; zi < val.length; zi++) {
                            var zItem = val[zi];
                            if (zItem.member !== undefined) {
                                zs.add(zItem.member, zItem.score);
                            } else if (Array.isArray(zItem)) {
                                zs.add(zItem[0], zItem[1]);
                            }
                        }
                    }
                    val = zs;
                }
                this.set(db, key, val, entry.type);
            }
        }
    }
    if (snapshot.expiries) {
        var now = Date.now();
        for (var mapKey in snapshot.expiries) {
            var deadline = snapshot.expiries[mapKey];
            if (deadline > now) {
                this.expiry.importAll({ [mapKey]: deadline });
            }
        }
    }
    this._restoring = false;
    this.resetDirty();
};

module.exports = {
    DataStore: DataStore,
    StorageEngine: DataStore,
    TYPE_STRING: TYPE_STRING,
    TYPE_LIST: TYPE_LIST,
    TYPE_SET: TYPE_SET,
    TYPE_ZSET: TYPE_ZSET,
    TYPE_HASH: TYPE_HASH
};
