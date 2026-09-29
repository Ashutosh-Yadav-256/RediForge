'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { DataStore, TYPE_STRING, TYPE_LIST, TYPE_HASH, TYPE_SET, TYPE_ZSET } = require('../src/datastore/store');
const { MutationEngine } = require('../src/engine/mutation_engine');
const { WriteAheadLog } = require('../src/persistence/wal');
const { RdbPersistence } = require('../src/persistence/rdb');
const { ServerConfig } = require('../src/config');
const { dispatch } = require('../src/commands/registry');

const TEST_DIR = path.join(__dirname, '.tmp_recovery_test');

describe('WAL, MutationEngine & Crash Recovery Suite', () => {
    let store, config, wal, mutationEngine;

    beforeEach(() => {
        if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
        config = new ServerConfig({ dir: TEST_DIR, aof_filename: 'recovery.wal', appendonly: true, appendfsync: 'always' });
        store = new DataStore(16, config);
        mutationEngine = new MutationEngine();
        store.setMutationEngine(mutationEngine);
        wal = new WriteAheadLog(config, { filename: 'recovery.wal' });
        wal.open();
        mutationEngine.setWal(wal);
    });

    afterEach(() => {
        if (wal) wal.close();
        try {
            const files = fs.readdirSync(TEST_DIR);
            for (const f of files) fs.unlinkSync(path.join(TEST_DIR, f));
            fs.rmdirSync(TEST_DIR);
        } catch (e) {}
    });

    it('MutationEngine emits canonical event on successful write and advances sequence', () => {
        const events = [];
        mutationEngine.on('mutation', (ev) => events.push(ev));

        store.set(0, 'user:1', 'Ashutosh', TYPE_STRING);
        store.hashSet(0, 'profile', [['name', 'Ashutosh'], ['role', 'CTO']]);
        store.listPushRight(0, 'logs', ['boot', 'ready']);

        assert.strictEqual(events.length, 3);
        assert.strictEqual(events[0].sequence, 1);
        assert.strictEqual(events[0].command, 'SET');
        assert.deepStrictEqual(events[0].args, ['user:1', 'Ashutosh']);
        assert.strictEqual(events[1].sequence, 2);
        assert.strictEqual(events[1].command, 'HSET');
        assert.strictEqual(events[2].sequence, 3);
        assert.strictEqual(events[2].command, 'RPUSH');
    });

    it('Failed mutation (OOM rejection) NEVER produces a MutationEvent or WAL entry', () => {
        const lowMemConfig = new ServerConfig({ maxmemory: 100, maxmemory_policy: 'noeviction' });
        const strictStore = new DataStore(16, lowMemConfig);
        const strictEngine = new MutationEngine();
        strictStore.setMutationEngine(strictEngine);

        const events = [];
        strictEngine.on('mutation', (ev) => events.push(ev));

        assert.strictEqual(strictStore.set(0, 'k', 'v'), true);
        assert.strictEqual(events.length, 1);

        const bigVal = 'x'.repeat(500);
        const res = strictStore.set(0, 'huge', bigVal);
        assert.strictEqual(res, false);
        assert.strictEqual(events.length, 1);
        assert.strictEqual(strictStore.exists(0, 'huge'), false);
    });

    it('Write -> Crash -> Restart -> Replay restores identical state across data types', () => {
        store.set(0, 'str_key', 'hello_world', TYPE_STRING);
        store.set(1, 'db1_key', 'cross_db_val', TYPE_STRING);
        store.hashSet(0, 'user_hash', [['city', 'Bangalore'], ['country', 'India']]);
        store.listPushRight(0, 'queue', ['task1', 'task2', 'task3']);
        store.listPopLeft(0, 'queue', 1);
        store.setAdd(0, 'active_users', ['alice', 'bob', 'carol']);
        store.setRemove(0, 'active_users', ['bob']);
        store.zsetAdd(0, 'leaderboard', [{ member: 'alice', score: 100 }, { member: 'bob', score: 200 }]);
        store.renameKey(0, 'str_key', 'renamed_key');

        wal.close();

        const storeRecovered = new DataStore(16, config);
        const walRecovery = new WriteAheadLog(config, { filename: 'recovery.wal' });

        const replayCtx = {
            db: 0,
            store: storeRecovered,
            config: config,
            connection: { db: 0, id: 0, name: null, txQueue: null },
            pubsub: null,
            clientCount: 0,
            aofBuffer: null
        };

        storeRecovered._restoring = true;
        const result = walRecovery.replay((cmdParts, db) => {
            replayCtx.db = db;
            dispatch(cmdParts, replayCtx);
        });
        storeRecovered._restoring = false;

        assert.ok(result.replayed > 0);
        assert.strictEqual(result.truncated, false);

        assert.strictEqual(storeRecovered.exists(0, 'str_key'), false);
        assert.strictEqual(storeRecovered.get(0, 'renamed_key'), 'hello_world');
        assert.strictEqual(storeRecovered.get(1, 'db1_key'), 'cross_db_val');

        const hash = storeRecovered.get(0, 'user_hash');
        assert.strictEqual(hash.get('city'), 'Bangalore');
        assert.strictEqual(hash.get('country'), 'India');

        const list = storeRecovered.get(0, 'queue');
        assert.strictEqual(list.length, 2);
        assert.strictEqual(list[0], 'task2');
        assert.strictEqual(list[1], 'task3');

        const set = storeRecovered.get(0, 'active_users');
        assert.ok(set.has('alice'));
        assert.strictEqual(set.has('bob'), false);
        assert.ok(set.has('carol'));

        const zset = storeRecovered.get(0, 'leaderboard');
        assert.strictEqual(zset.getScore('alice'), 100);
        assert.strictEqual(zset.getScore('bob'), 200);
    });

    it('Binary-safe large payload survives WAL write and recovery', () => {
        const binaryBytes = Buffer.alloc(256 * 200);
        for (let i = 0; i < binaryBytes.length; i++) {
            binaryBytes[i] = i % 256;
        }

        store.set(0, 'bin_payload', binaryBytes, TYPE_STRING);
        wal.close();

        const storeRecovered = new DataStore(16, config);
        const walRecovery = new WriteAheadLog(config, { filename: 'recovery.wal' });

        const replayCtx = {
            db: 0,
            store: storeRecovered,
            config: config,
            connection: { db: 0, id: 0, name: null, txQueue: null },
            pubsub: null,
            clientCount: 0,
            aofBuffer: null
        };

        storeRecovered._restoring = true;
        walRecovery.replay((cmdParts, db) => {
            replayCtx.db = db;
            dispatch(cmdParts, replayCtx);
        });
        storeRecovered._restoring = false;

        const recoveredBuf = storeRecovered.get(0, 'bin_payload');
        assert.ok(Buffer.isBuffer(recoveredBuf));
        assert.strictEqual(recoveredBuf.length, binaryBytes.length);
        assert.ok(recoveredBuf.equals(binaryBytes));
    });

    it('Partial/truncated final WAL command at EOF is detected and handled without corruption', () => {
        store.set(0, 'valid1', 'val1', TYPE_STRING);
        store.set(0, 'valid2', 'val2', TYPE_STRING);
        wal.close();

        const filePath = wal.getFilePath();
        const partialFrame = Buffer.from('*3\r\n$3\r\nSET\r\n$7\r\nincompl');
        fs.appendFileSync(filePath, partialFrame);

        const storeRecovered = new DataStore(16, config);
        const walRecovery = new WriteAheadLog(config, { filename: 'recovery.wal' });

        const replayCtx = {
            db: 0,
            store: storeRecovered,
            config: config,
            connection: { db: 0, id: 0, name: null, txQueue: null },
            pubsub: null,
            clientCount: 0,
            aofBuffer: null
        };

        storeRecovered._restoring = true;
        const result = walRecovery.replay((cmdParts, db) => {
            replayCtx.db = db;
            dispatch(cmdParts, replayCtx);
        });
        storeRecovered._restoring = false;

        assert.strictEqual(result.replayed, 2);
        assert.strictEqual(result.truncated, true);
        assert.strictEqual(storeRecovered.get(0, 'valid1'), 'val1');
        assert.strictEqual(storeRecovered.get(0, 'valid2'), 'val2');
        assert.strictEqual(storeRecovered.exists(0, 'incompl'), false);
    });

    it('Snapshot + WAL tail combined recovery', () => {
        store.set(0, 'base_key', 'snapshot_val', TYPE_STRING);
        store.set(0, 'will_be_updated', 'v1', TYPE_STRING);

        const rdbConfig = new ServerConfig({ dir: TEST_DIR, rdb_filename: 'snapshot.rdb' });
        const rdb = new RdbPersistence(rdbConfig, store);
        assert.ok(rdb.save());

        store.set(0, 'will_be_updated', 'v2', TYPE_STRING);
        store.set(0, 'wal_new_key', 'created_after_snapshot', TYPE_STRING);
        wal.close();

        const storeRecovered = new DataStore(16, config);
        const rdbRecovered = new RdbPersistence(rdbConfig, storeRecovered);
        assert.ok(rdbRecovered.load());

        assert.strictEqual(storeRecovered.get(0, 'base_key'), 'snapshot_val');
        assert.strictEqual(storeRecovered.get(0, 'will_be_updated'), 'v1');

        const walRecovery = new WriteAheadLog(config, { filename: 'recovery.wal' });
        const replayCtx = {
            db: 0,
            store: storeRecovered,
            config: config,
            connection: { db: 0, id: 0, name: null, txQueue: null },
            pubsub: null,
            clientCount: 0,
            aofBuffer: null
        };

        storeRecovered._restoring = true;
        walRecovery.replay((cmdParts, db) => {
            replayCtx.db = db;
            dispatch(cmdParts, replayCtx);
        });
        storeRecovered._restoring = false;

        assert.strictEqual(storeRecovered.get(0, 'base_key'), 'snapshot_val');
        assert.strictEqual(storeRecovered.get(0, 'will_be_updated'), 'v2');
        assert.strictEqual(storeRecovered.get(0, 'wal_new_key'), 'created_after_snapshot');
    });

    it('Replays high volume workload (5,000 operations) deterministically', () => {
        const OP_COUNT = 5000;
        for (let i = 0; i < OP_COUNT; i++) {
            store.set(i % 4, 'key:' + i, 'val:' + i, TYPE_STRING);
        }
        wal.close();

        const storeRecovered = new DataStore(16, config);
        const walRecovery = new WriteAheadLog(config, { filename: 'recovery.wal' });

        const replayCtx = {
            db: 0,
            store: storeRecovered,
            config: config,
            connection: { db: 0, id: 0, name: null, txQueue: null },
            pubsub: null,
            clientCount: 0,
            aofBuffer: null
        };

        storeRecovered._restoring = true;
        const result = walRecovery.replay((cmdParts, db) => {
            replayCtx.db = db;
            dispatch(cmdParts, replayCtx);
        });
        storeRecovered._restoring = false;

        assert.strictEqual(result.replayed, OP_COUNT);
        assert.strictEqual(storeRecovered.get(0, 'key:0'), 'val:0');
        assert.strictEqual(storeRecovered.get(1, 'key:1'), 'val:1');
        assert.strictEqual(storeRecovered.get(2, 'key:2'), 'val:2');
        assert.strictEqual(storeRecovered.get(3, 'key:3'), 'val:3');
        assert.strictEqual(storeRecovered.get(0, 'key:4996'), 'val:4996');
    });
});
