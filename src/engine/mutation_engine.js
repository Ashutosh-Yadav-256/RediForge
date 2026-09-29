'use strict';

var EventEmitter = require('node:events');
var util = require('node:util');

function MutationEngine(options) {
    EventEmitter.call(this);
    this.options = options || {};
    this._sequence = 0;
    this._wal = options && options.wal ? options.wal : null;
    this._metrics = options && options.metrics ? options.metrics : null;
}
util.inherits(MutationEngine, EventEmitter);

Object.defineProperty(MutationEngine.prototype, 'sequence', {
    get: function () { return this._sequence; }
});

MutationEngine.prototype.setWal = function (wal) {
    this._wal = wal;
};

MutationEngine.prototype.setMetrics = function (metrics) {
    this._metrics = metrics;
};

MutationEngine.prototype.record = function (db, command, args, timestamp) {
    this._sequence++;
    var event = {
        sequence: this._sequence,
        db: typeof db === 'number' ? db : 0,
        command: String(command).toUpperCase(),
        args: args || [],
        timestamp: timestamp || Date.now()
    };

    if (this._wal) {
        if (typeof this._wal.appendEvent === 'function') {
            this._wal.appendEvent(event);
        } else if (typeof this._wal.appendCommand === 'function') {
            this._wal.appendCommand([event.command].concat(event.args));
        }
    }

    if (this._metrics && typeof this._metrics.recordMutation === 'function') {
        this._metrics.recordMutation(event);
    }

    this.emit('mutation', event);
    return event;
};

module.exports = { MutationEngine: MutationEngine };
