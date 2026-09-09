'use strict';

class AuditLogger {
    constructor(maxEntries = 1000) {
        this.maxEntries = maxEntries;
        this.entries = [];
        this._counter = 1;
    }

    sanitizeArgs(cmdName, args) {
        if (!args || !Array.isArray(args)) return [];
        const cmd = (cmdName || '').toLowerCase();

        if (cmd === 'auth') {
            return args.map(() => '******');
        }

        if (cmd === 'config' && args.length >= 2 && args[0].toLowerCase() === 'set') {
            if (args[1].toLowerCase() === 'requirepass') {
                return [args[0], args[1], '******'];
            }
        }

        return args.map(a => (typeof a === 'string' && a.length > 100 ? a.substring(0, 100) + '...' : a));
    }

    log(event) {
        const record = {
            id: this._counter++,
            timestamp: new Date().toISOString(),
            userId: event.userId || 'anonymous',
            workspaceId: event.workspaceId || 'default',
            remoteAddr: event.remoteAddr || 'unknown',
            command: event.command ? event.command.toUpperCase() : 'UNKNOWN',
            args: this.sanitizeArgs(event.command, event.args),
            status: event.status || 'ALLOWED', // ALLOWED, DENIED, ERROR
            reason: event.reason || null,
            durationMs: event.durationMs !== undefined ? event.durationMs : 0
        };

        this.entries.push(record);
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }

        return record;
    }

    query(filter = {}) {
        let results = this.entries;

        if (filter.userId) {
            results = results.filter(e => e.userId === filter.userId);
        }
        if (filter.workspaceId) {
            results = results.filter(e => e.workspaceId === filter.workspaceId);
        }
        if (filter.status) {
            results = results.filter(e => e.status === filter.status);
        }
        if (filter.command) {
            const cmd = filter.command.toUpperCase();
            results = results.filter(e => e.command === cmd);
        }

        const limit = filter.limit || 50;
        return results.slice(-limit).reverse();
    }

    clear() {
        this.entries = [];
    }
}

module.exports = { AuditLogger };
