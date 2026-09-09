'use strict';

var ExpiryManager = require('./expiry').ExpiryManager;
var LRUEviction = require('./lru').LRUEviction;

var TYPE_STRING = 'string';
var TYPE_LIST = 'list';
var TYPE_SET = 'set';
var TYPE_ZSET = 'zset';
var TYPE_HASH = 'hash';

function estimateMemory(key, value, type) {
    var bytes = Buffer.byteLength(String(key)) + 48;
    if (value === undefined || value === null) return bytes;

    if (type === TYPE_STRING || typeof value === 'string') {
        bytes += Buffer.byteLength(String(value)) + 16;
    } else if (type === TYPE_HASH && value instanceof Map) {
        bytes += 48;
        for (var entry of value) {
            bytes += Buffer.byteLength(String(entry[0])) + Buffer.byteLength(String(entry[1])) + 48;
        }
    } else if (type === TYPE_LIST && Array.isArray(value)) {
        bytes += 48;
        for (var i = 0; i < value.length; i++) {
            bytes += Buffer.byteLength(String(value[i])) + 32;
        }
    } else if (type === TYPE_SET && value instanceof Set) {
        bytes += 48;
        for (var item of value) {
            bytes += Buffer.byteLength(String(item)) + 32;
        }
    } else if (type === TYPE_ZSET && Array.isArray(value)) {
        bytes += 48;
        for (var j = 0; j < value.length; j++) {
            var m = value[j];
            bytes += Buffer.byteLength(String(m.member || '')) + 48;
        }
    } else {
        bytes += 32;
    }
    return bytes;
}

function DataStore(dbCount, config) {
    this.dbCount = dbCount || 16;
    this._config = config || null;
    this._dbs = [];
    this._types = [];
    this._keyMemories = [];
    this._usedMemory = 0;
    for (var i = 0; i < this.dbCount; i++) {
        this._dbs.push(new Map());
        this._types.push(new Map());
        this._keyMemories.push(new Map());
    }
    this.expiry = new ExpiryManager();
    this.lru = new LRUEviction(5);
    this._dirty = 0;
    this._watchedKeys = new Map();
    this._keyVersions = new Map();
    this._restoring = false;
}

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
    this._dirty++;
};

DataStore.prototype.flushAll = function () {
    for (var i = 0; i < this.dbCount; i++) {
        this._dbs[i].clear();
        this._types[i].clear();
        this._keyMemories[i].clear();
    }
    this._usedMemory = 0;
    this.expiry.clearAll();
    this.lru.clearAll();
    this._dirty++;
};

DataStore.prototype.swapDb = function (a, b) {
    if (a < 0 || a >= this.dbCount || b < 0 || b >= this.dbCount) {
        return false;
    }
    var tmpDb = this._dbs[a];
    var tmpType = this._types[a];
    var tmpMem = this._keyMemories[a];

    this._dbs[a] = this._dbs[b];
    this._types[a] = this._types[b];
    this._keyMemories[a] = this._keyMemories[b];

    this._dbs[b] = tmpDb;
    this._types[b] = tmpType;
    this._keyMemories[b] = tmpMem;

    this.expiry.swapDb(a, b);
    this.lru.swapDb(a, b);
    return true;
};

DataStore.prototype.randomKey = function (db) {
    var keys = this.keysInDb(db);
    if (keys.length === 0) return null;
    return keys[Math.floor(Math.random() * keys.length)];
};

DataStore.prototype.rename = function (db, from, to) {
    this._checkExpired(db, from);
    if (!this._dbs[db].has(from)) return false;

    var value = this._dbs[db].get(from);
    var type = this._types[db].get(from);
    var expiryDeadline = this.expiry.getExpiry(db, from);

    this.deleteKey(db, from);
    this.set(db, to, value, type);

    if (expiryDeadline > 0) {
        this.expiry.setExpireAt(db, to, expiryDeadline);
    }

    return true;
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
    this._watchedKeys.get(clientId).set(mapKey, version);
};

DataStore.prototype.unwatchAll = function (clientId) {
    this._watchedKeys.delete(clientId);
};

DataStore.prototype.isWatchDirty = function (clientId) {
    var watched = this._watchedKeys.get(clientId);
    if (!watched) return false;

    for (var entry of watched) {
        var mapKey = entry[0];
        var savedVersion = entry[1];
        var currentVersion = this._keyVersions.get(mapKey) || 0;
        if (currentVersion !== savedVersion) {
            return true;
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
    var out = {};
    for (var entry of this._dbs[db]) {
        var key = entry[0];
        var value = entry[1];
        if (!this._checkExpired(db, key)) {
            out[key] = {
                value: value,
                type: this._types[db].get(key)
            };
        }
    }
    return out;
};

DataStore.prototype.importDbData = function (db, data) {
    for (var key in data) {
        this.set(db, key, data[key].value, data[key].type);
    }
};

module.exports = {
    DataStore: DataStore,
    TYPE_STRING: TYPE_STRING,
    TYPE_LIST: TYPE_LIST,
    TYPE_SET: TYPE_SET,
    TYPE_ZSET: TYPE_ZSET,
    TYPE_HASH: TYPE_HASH
};
