'use strict';

function ExpiryHeap() {
    this._heap = [];
    this._indices = new Map();
}

ExpiryHeap.prototype.size = function () {
    return this._heap.length;
};

ExpiryHeap.prototype.peek = function () {
    return this._heap.length > 0 ? this._heap[0] : null;
};

ExpiryHeap.prototype._swap = function (i, j) {
    var a = this._heap[i];
    var b = this._heap[j];
    this._heap[i] = b;
    this._heap[j] = a;
    this._indices.set(b.mapKey, i);
    this._indices.set(a.mapKey, j);
};

ExpiryHeap.prototype._siftUp = function (idx) {
    while (idx > 0) {
        var parent = (idx - 1) >> 1;
        if (this._heap[idx].deadline < this._heap[parent].deadline) {
            this._swap(idx, parent);
            idx = parent;
        } else {
            break;
        }
    }
};

ExpiryHeap.prototype._siftDown = function (idx) {
    var len = this._heap.length;
    while (true) {
        var left = (idx << 1) + 1;
        var right = left + 1;
        var smallest = idx;

        if (left < len && this._heap[left].deadline < this._heap[smallest].deadline) {
            smallest = left;
        }
        if (right < len && this._heap[right].deadline < this._heap[smallest].deadline) {
            smallest = right;
        }

        if (smallest !== idx) {
            this._swap(idx, smallest);
            idx = smallest;
        } else {
            break;
        }
    }
};

ExpiryHeap.prototype.insertOrUpdate = function (db, key, deadline) {
    var mapKey = db + ':' + key;
    var idx = this._indices.get(mapKey);
    if (idx !== undefined) {
        var old = this._heap[idx].deadline;
        this._heap[idx].deadline = deadline;
        if (deadline < old) {
            this._siftUp(idx);
        } else {
            this._siftDown(idx);
        }
    } else {
        var node = { db: db, key: key, deadline: deadline, mapKey: mapKey };
        var newIdx = this._heap.length;
        this._heap.push(node);
        this._indices.set(mapKey, newIdx);
        this._siftUp(newIdx);
    }
};

ExpiryHeap.prototype.remove = function (mapKey) {
    var idx = this._indices.get(mapKey);
    if (idx === undefined) return null;

    var lastIdx = this._heap.length - 1;
    var removed = this._heap[idx];
    if (idx === lastIdx) {
        this._heap.pop();
        this._indices.delete(mapKey);
    } else {
        this._swap(idx, lastIdx);
        this._heap.pop();
        this._indices.delete(mapKey);
        this._siftDown(idx);
        this._siftUp(idx);
    }
    return removed;
};

ExpiryHeap.prototype.popRoot = function () {
    if (this._heap.length === 0) return null;
    var root = this._heap[0];
    var lastIdx = this._heap.length - 1;
    if (lastIdx === 0) {
        this._heap.pop();
        this._indices.delete(root.mapKey);
    } else {
        this._swap(0, lastIdx);
        this._heap.pop();
        this._indices.delete(root.mapKey);
        this._siftDown(0);
    }
    return root;
};

ExpiryHeap.prototype.clear = function () {
    this._heap.length = 0;
    this._indices.clear();
};

function ExpiryManager() {
    this._timers = new Map();
    this._heap = new ExpiryHeap();
    this._sweepInterval = null;
}

ExpiryManager.prototype.setExpiry = function (db, key, ms) {
    var mapKey = db + ':' + key;
    var deadline = Date.now() + ms;
    this._timers.set(mapKey, deadline);
    this._heap.insertOrUpdate(db, key, deadline);
};

ExpiryManager.prototype.setExpireAt = function (db, key, timestampMs) {
    var mapKey = db + ':' + key;
    this._timers.set(mapKey, timestampMs);
    this._heap.insertOrUpdate(db, key, timestampMs);
};

ExpiryManager.prototype.getExpiry = function (db, key) {
    var mapKey = db + ':' + key;
    return this._timers.get(mapKey) || -1;
};

ExpiryManager.prototype.removeExpiry = function (db, key) {
    var mapKey = db + ':' + key;
    this._timers.delete(mapKey);
    this._heap.remove(mapKey);
};

ExpiryManager.prototype.isExpired = function (db, key) {
    var mapKey = db + ':' + key;
    var deadline = this._timers.get(mapKey);
    if (deadline === undefined) return false;
    return Date.now() >= deadline;
};

ExpiryManager.prototype.ttlMs = function (db, key) {
    var mapKey = db + ':' + key;
    var deadline = this._timers.get(mapKey);
    if (deadline === undefined) return -1;
    var remaining = deadline - Date.now();
    if (remaining <= 0) return -2;
    return remaining;
};

ExpiryManager.prototype.ttlSec = function (db, key) {
    var ms = this.ttlMs(db, key);
    if (ms < 0) return ms;
    return Math.ceil(ms / 1000);
};

ExpiryManager.prototype.hasExpiry = function (db, key) {
    return this._timers.has(db + ':' + key);
};

ExpiryManager.prototype.peekNextExpiry = function () {
    return this._heap.peek();
};

ExpiryManager.prototype.expireNextKey = function (store, now) {
    now = now || Date.now();
    var next = this._heap.peek();
    if (!next || next.deadline > now) return null;
    var popped = this._heap.popRoot();
    this._timers.delete(popped.mapKey);
    store.deleteKey(popped.db, popped.key);
    return popped;
};

ExpiryManager.prototype.bulkCleanup = function (store, limit) {
    var count = 0;
    var max = limit || 100;
    var now = Date.now();
    while (count < max) {
        var expired = this.expireNextKey(store, now);
        if (!expired) break;
        count++;
    }
    return count;
};

ExpiryManager.prototype.startActiveSweep = function (store, hz) {
    if (this._sweepInterval) return;

    var self = this;
    var intervalMs = Math.max(50, Math.floor(1000 / (hz || 10)));

    this._sweepInterval = setInterval(function () {
        self._sweep(store);
    }, intervalMs);

    if (this._sweepInterval.unref) {
        this._sweepInterval.unref();
    }
};

ExpiryManager.prototype.stopActiveSweep = function () {
    if (this._sweepInterval) {
        clearInterval(this._sweepInterval);
        this._sweepInterval = null;
    }
};

ExpiryManager.prototype._sweep = function (store) {
    var now = Date.now();
    var count = 0;
    var maxBatch = 100;
    while (count < maxBatch) {
        var next = this._heap.peek();
        if (!next || next.deadline > now) break;
        var popped = this._heap.popRoot();
        this._timers.delete(popped.mapKey);
        store.deleteKey(popped.db, popped.key);
        count++;
    }
    return count;
};

ExpiryManager.prototype.swapDb = function (a, b) {
    var aPrefix = a + ':';
    var bPrefix = b + ':';
    var aEntries = [];
    var bEntries = [];

    for (var entry of this._timers) {
        var mapKey = entry[0];
        var deadline = entry[1];
        if (mapKey.startsWith(aPrefix)) {
            aEntries.push({ suffix: mapKey.substring(aPrefix.length), deadline: deadline });
            this._timers.delete(mapKey);
            this._heap.remove(mapKey);
        } else if (mapKey.startsWith(bPrefix)) {
            bEntries.push({ suffix: mapKey.substring(bPrefix.length), deadline: deadline });
            this._timers.delete(mapKey);
            this._heap.remove(mapKey);
        }
    }

    for (var i = 0; i < aEntries.length; i++) {
        var newKeyB = bPrefix + aEntries[i].suffix;
        this._timers.set(newKeyB, aEntries[i].deadline);
        this._heap.insertOrUpdate(b, aEntries[i].suffix, aEntries[i].deadline);
    }
    for (var j = 0; j < bEntries.length; j++) {
        var newKeyA = aPrefix + bEntries[j].suffix;
        this._timers.set(newKeyA, bEntries[j].deadline);
        this._heap.insertOrUpdate(a, bEntries[j].suffix, bEntries[j].deadline);
    }
};

ExpiryManager.prototype.clearDb = function (db) {
    var prefix = db + ':';
    for (var key of Array.from(this._timers.keys())) {
        if (key.startsWith(prefix)) {
            this._timers.delete(key);
            this._heap.remove(key);
        }
    }
};

ExpiryManager.prototype.clearAll = function () {
    this._timers.clear();
    this._heap.clear();
};

Object.defineProperty(ExpiryManager.prototype, 'size', {
    get: function () { return this._timers.size; }
});

ExpiryManager.prototype.exportAll = function () {
    var out = {};
    for (var entry of this._timers) {
        out[entry[0]] = entry[1];
    }
    return out;
};

ExpiryManager.prototype.importAll = function (data) {
    for (var mapKey in data) {
        var sepIdx = mapKey.indexOf(':');
        var db = parseInt(mapKey.substring(0, sepIdx), 10);
        var key = mapKey.substring(sepIdx + 1);
        var deadline = data[mapKey];
        this._timers.set(mapKey, deadline);
        this._heap.insertOrUpdate(db, key, deadline);
    }
};

module.exports = {
    ExpiryManager: ExpiryManager,
    ExpiryHeap: ExpiryHeap
};
