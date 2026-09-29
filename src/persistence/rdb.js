'use strict';

var fs = require('fs');
var path = require('path');
var logger = require('../utils/logger');

function RdbPersistence(config, store) {
    this._config = config;
    this._store = store;
    this._saveTimer = null;
    this._lastSaveTime = Date.now();
    this._lastSaveDirty = 0;
    this._log = logger.getLogger();
}

RdbPersistence.prototype.getFilePath = function () {
    var dir = this._config.get('dir');
    var filename = this._config.get('rdb_filename');
    return path.resolve(dir, filename);
};

RdbPersistence.prototype.save = function () {
    var filePath = this.getFilePath();
    var snapshot = this._buildSnapshot();

    try {
        var tmpPath = filePath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(snapshot), 'utf8');
        fs.renameSync(tmpPath, filePath);
        this._lastSaveTime = Date.now();
        this._lastSaveDirty = this._store.dirty;
        this._log.info('RDB: snapshot saved to ' + filePath);
        return true;
    } catch (err) {
        this._log.error('RDB: save failed - ' + err.message);
        return false;
    }
};

RdbPersistence.prototype.load = function () {
    var filePath = this.getFilePath();

    if (!fs.existsSync(filePath)) {
        this._log.info('RDB: no snapshot found at ' + filePath);
        return false;
    }

    try {
        var raw = fs.readFileSync(filePath, 'utf8');
        var snapshot = JSON.parse(raw);
        this._restoreSnapshot(snapshot);
        this._log.info('RDB: loaded snapshot from ' + filePath);
        return true;
    } catch (err) {
        this._log.error('RDB: load failed - ' + err.message);
        return false;
    }
};

RdbPersistence.prototype.startAutoSave = function () {
    var saveRules = this._config.get('save');
    if (!saveRules || saveRules.length === 0) return;

    var self = this;
    this._saveTimer = setInterval(function () {
        self._checkAutoSave(saveRules);
    }, 1000);

    if (this._saveTimer.unref) {
        this._saveTimer.unref();
    }
};

RdbPersistence.prototype.stopAutoSave = function () {
    if (this._saveTimer) {
        clearInterval(this._saveTimer);
        this._saveTimer = null;
    }
};

RdbPersistence.prototype._checkAutoSave = function (rules) {
    var now = Date.now();
    var elapsed = (now - this._lastSaveTime) / 1000;
    var changes = this._store.dirty - this._lastSaveDirty;

    for (var i = 0; i < rules.length; i++) {
        var seconds = rules[i][0];
        var minChanges = rules[i][1];
        if (elapsed >= seconds && changes >= minChanges) {
            this._log.info('RDB: auto-save triggered (' + changes + ' changes in ' + Math.floor(elapsed) + 's)');
            this.save();
            return;
        }
    }
};

RdbPersistence.prototype._buildSnapshot = function () {
    var databases = {};

    for (var i = 0; i < this._store.dbCount; i++) {
        var data = this._store.exportDbData(i);
        if (Array.isArray(data) && data.length > 0) {
            databases[i] = [];
            for (var j = 0; j < data.length; j++) {
                var k = data[j][0];
                var ent = data[j][1];
                databases[i].push([
                    k,
                    {
                        type: ent.type,
                        value: this._serializeValue(ent.value, ent.type)
                    }
                ]);
            }
        } else if (data && !Array.isArray(data) && Object.keys(data).length > 0) {
            databases[i] = [];
            for (var key of Object.keys(data)) {
                var entry = data[key];
                databases[i].push([
                    key,
                    {
                        type: entry.type,
                        value: this._serializeValue(entry.value, entry.type)
                    }
                ]);
            }
        }
    }

    var expiries = this._store.expiry.exportAll();

    return {
        magic: 'REDISGEN',
        version: 2,
        timestamp: Date.now(),
        databases: databases,
        expiries: expiries
    };
};

RdbPersistence.prototype._restoreSnapshot = function (snapshot) {
    if (snapshot.magic !== 'REDISGEN') {
        throw new Error('invalid snapshot format');
    }

    this._store.flushAll();
    this._store._restoring = true;

    for (var dbIdx in snapshot.databases) {
        var db = parseInt(dbIdx, 10);
        var entries = snapshot.databases[dbIdx];

        if (Array.isArray(entries)) {
            for (var i = 0; i < entries.length; i++) {
                var item = entries[i];
                var key = item[0];
                var entry = item[1];
                var value = this._deserializeValue(entry.value, entry.type);
                this._store.set(db, key, value, entry.type);
            }
        } else if (entries && typeof entries === 'object') {
            for (var k in entries) {
                var oldEntry = entries[k];
                var val = this._deserializeValue(oldEntry.value, oldEntry.type);
                this._store.set(db, k, val, oldEntry.type);
            }
        }
    }

    if (snapshot.expiries) {
        var now = Date.now();
        for (var mapKey in snapshot.expiries) {
            var deadline = snapshot.expiries[mapKey];
            if (deadline > now) {
                this._store.expiry.importAll({ [mapKey]: deadline });
            }
        }
    }

    this._store._restoring = false;
    this._store.resetDirty();
};

var Deque = require('../structures/deque').Deque;
var SortedSet = require('../structures/zset').SortedSet;

RdbPersistence.prototype._serializeValue = function (value, type) {
    if (type === 'hash' && value instanceof Map) {
        return Array.from(value.entries());
    }
    if (type === 'set' && value instanceof Set) {
        return Array.from(value);
    }
    if (type === 'list') {
        if (value && typeof value.toArray === 'function') {
            return value.toArray();
        }
        if (Array.isArray(value)) return value;
    }
    if (type === 'zset') {
        if (value instanceof SortedSet || (value && typeof value.range === 'function')) {
            return value.range(0, -1, true);
        }
        if (value && value.members instanceof Map) {
            return Array.from(value.members.entries()).map(function (e) {
                return { member: e[0], score: e[1] };
            });
        }
    }
    return value;
};

RdbPersistence.prototype._deserializeValue = function (value, type) {
    if (type === 'hash' && Array.isArray(value)) {
        return new Map(value);
    }
    if (type === 'set' && Array.isArray(value)) {
        return new Set(value);
    }
    if (type === 'list') {
        return value;
    }
    if (type === 'zset') {
        var zs = new SortedSet();
        if (Array.isArray(value)) {
            for (var j = 0; j < value.length; j++) {
                var item = value[j];
                if (item.member !== undefined) {
                    zs.add(item.member, item.score);
                } else if (Array.isArray(item)) {
                    zs.add(item[0], item[1]);
                }
            }
            return zs;
        }
        if (value && Array.isArray(value.members)) {
            for (var k = 0; k < value.members.length; k++) {
                var pair = value.members[k];
                zs.add(pair[0], pair[1]);
            }
            return zs;
        }
    }
    return value;
};

module.exports = { RdbPersistence: RdbPersistence };
