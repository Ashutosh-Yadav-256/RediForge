'use strict';

function LRUEviction(maxSamples) {
    this._accessTime = new Map();
    this._maxSamples = maxSamples || 5;
    this._keys = [];
    this._keyPositions = new Map();
}

LRUEviction.prototype.touch = function (db, key) {
    var mapKey = db + ':' + key;
    this._accessTime.set(mapKey, Date.now());
    if (!this._keyPositions.has(mapKey)) {
        this._keyPositions.set(mapKey, this._keys.length);
        this._keys.push({ db: db, key: key, mapKey: mapKey });
    }
};

LRUEviction.prototype.remove = function (db, key) {
    var mapKey = db + ':' + key;
    this._accessTime.delete(mapKey);
    var idx = this._keyPositions.get(mapKey);
    if (idx !== undefined) {
        var lastIdx = this._keys.length - 1;
        var last = this._keys[lastIdx];
        if (idx !== lastIdx) {
            this._keys[idx] = last;
            this._keyPositions.set(last.mapKey, idx);
        }
        this._keys.pop();
        this._keyPositions.delete(mapKey);
    }
};

LRUEviction.prototype._pickCandidate = function (store, policy) {
    if (policy === 'volatile-lru') {
        var volatileHeap = store.expiry && store.expiry._heap ? store.expiry._heap._heap : [];
        if (volatileHeap.length === 0) return null;
        var bestVolatile = null;
        var bestVolatileTime = Infinity;
        var samplesV = Math.min(this._maxSamples, volatileHeap.length);
        for (var s = 0; s < samplesV; s++) {
            var randIdxV = Math.floor(Math.random() * volatileHeap.length);
            var item = volatileHeap[randIdxV];
            var lastAccessV = this._accessTime.get(item.mapKey) || 0;
            if (lastAccessV < bestVolatileTime) {
                bestVolatileTime = lastAccessV;
                bestVolatile = { db: item.db, key: item.key };
            }
        }
        return bestVolatile;
    }

    if (this._keys.length === 0) return null;
    var best = null;
    var bestTime = Infinity;
    var samples = Math.min(this._maxSamples, this._keys.length);
    for (var i = 0; i < samples; i++) {
        var randIdx = Math.floor(Math.random() * this._keys.length);
        var candidate = this._keys[randIdx];
        var lastAccess = this._accessTime.get(candidate.mapKey) || 0;
        if (lastAccess < bestTime) {
            bestTime = lastAccess;
            best = { db: candidate.db, key: candidate.key };
        }
    }
    return best;
};

LRUEviction.prototype.evict = function (store, policy, bytesToFree) {
    if (policy === 'noeviction') {
        return false;
    }

    var targetBytes = (bytesToFree && bytesToFree > 0) ? bytesToFree : 1;
    var totalFreed = 0;
    var maxRounds = 1000;
    var rounds = 0;

    while (totalFreed < targetBytes && rounds < maxRounds) {
        rounds++;
        var candidate = this._pickCandidate(store, policy);
        if (!candidate) break;

        var memBefore = store.usedMemory;
        store.deleteKey(candidate.db, candidate.key);
        this.remove(candidate.db, candidate.key);
        var freed = memBefore - store.usedMemory;
        if (freed <= 0) {
            freed = 64;
        }
        totalFreed += freed;
    }

    return totalFreed > 0 ? totalFreed : false;
};

LRUEviction.prototype.swapDb = function (a, b) {
    var aPrefix = a + ':';
    var bPrefix = b + ':';
    var aEntries = [];
    var bEntries = [];

    for (var entry of this._accessTime) {
        var mapKey = entry[0];
        var ts = entry[1];
        if (mapKey.startsWith(aPrefix)) {
            aEntries.push({ suffix: mapKey.substring(aPrefix.length), ts: ts });
            this.remove(a, mapKey.substring(aPrefix.length));
        } else if (mapKey.startsWith(bPrefix)) {
            bEntries.push({ suffix: mapKey.substring(bPrefix.length), ts: ts });
            this.remove(b, mapKey.substring(bPrefix.length));
        }
    }

    for (var i = 0; i < aEntries.length; i++) {
        var keyB = aEntries[i].suffix;
        this.touch(b, keyB);
        this._accessTime.set(b + ':' + keyB, aEntries[i].ts);
    }
    for (var j = 0; j < bEntries.length; j++) {
        var keyA = bEntries[j].suffix;
        this.touch(a, keyA);
        this._accessTime.set(a + ':' + keyA, bEntries[j].ts);
    }
};

LRUEviction.prototype.clearDb = function (db) {
    var prefix = db + ':';
    for (var key of Array.from(this._accessTime.keys())) {
        if (key.startsWith(prefix)) {
            var actualKey = key.substring(prefix.length);
            this.remove(db, actualKey);
        }
    }
};

LRUEviction.prototype.clearAll = function () {
    this._accessTime.clear();
    this._keys.length = 0;
    this._keyPositions.clear();
};

module.exports = { LRUEviction: LRUEviction };
