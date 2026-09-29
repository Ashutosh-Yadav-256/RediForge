'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const net = require('net');
const { DataStore, TYPE_LIST, TYPE_HASH, TYPE_SET, TYPE_ZSET } = require('../src/datastore/store');
const { ServerConfig } = require('../src/config');
const { dispatch } = require('../src/commands/registry');
const { PubSubBroker } = require('../src/commands/pubsub');
const { RdbPersistence } = require('../src/persistence/rdb');
const { AofPersistence } = require('../src/persistence/aof');
const { RespParser } = require('../src/protocol/parser');
const encoder = require('../src/protocol/encoder');
const { RedisGenServer } = require('../src/server');
const fs = require('fs');
const path = require('path');

function makeCtx(store, config, connection) {
    return {
        db: connection?.db || 0,
        store: store,
        config: config || new ServerConfig(),
        connection: connection || { db: 0, id: 1, name: null, txQueue: null, watchedKeys: null, authenticated: false },
        pubsub: new PubSubBroker(),
        clientCount: 1,
        aofBuffer: null
    };
}

describe('RediForge v2 Correctness & Invariants', () => {

    describe('P0 Bug 1: Maxmemory rejection atomicity (No partial mutations)', () => {
        it('LPUSH / RPUSH does not mutate list if OOM rejected', () => {
            const config = new ServerConfig({
                maxmemory: 200,
                maxmemory_policy: 'noeviction'
            });
            const store = new DataStore(16, config);
            const ctx = makeCtx(store, config);

            const r1 = dispatch(['rpush', 'mylist', 'item1', 'item2'], ctx);
            assert.ok(r1.includes(':2\r\n'));

            config.set('maxmemory', String(store.usedMemory + 1));

            const r2 = dispatch(['lpush', 'mylist', 'very_large_value_that_exceeds_memory_budget_definitely'], ctx);
            assert.ok(r2.includes('-OOM'), `Expected OOM error, got ${r2}`);

            const listVal = store.get(0, 'mylist');
            assert.strictEqual(listVal.length, 2);
            assert.strictEqual(listVal[0], 'item1');
            assert.strictEqual(listVal[1], 'item2');
        });

        it('HSET does not mutate hash if OOM rejected', () => {
            const config = new ServerConfig({
                maxmemory: 500,
                maxmemory_policy: 'noeviction'
            });
            const store = new DataStore(16, config);
            const ctx = makeCtx(store, config);

            const r1 = dispatch(['hset', 'myhash', 'field1', 'val1'], ctx);
            assert.strictEqual(r1, ':1\r\n');

            config.set('maxmemory', String(store.usedMemory + 2));

            const r2 = dispatch(['hset', 'myhash', 'field2', 'very_long_value_that_exceeds_the_remaining_two_bytes'], ctx);
            assert.ok(r2.includes('-OOM'), `Expected OOM error, got ${r2}`);

            const hashVal = store.get(0, 'myhash');
            assert.strictEqual(hashVal.size, 1);
            assert.strictEqual(hashVal.get('field1'), 'val1');
            assert.strictEqual(hashVal.has('field2'), false);
        });

        it('SADD does not mutate set if OOM rejected', () => {
            const config = new ServerConfig({
                maxmemory: 500,
                maxmemory_policy: 'noeviction'
            });
            const store = new DataStore(16, config);
            const ctx = makeCtx(store, config);

            const r1 = dispatch(['sadd', 'myset', 'elem1'], ctx);
            assert.strictEqual(r1, ':1\r\n');

            config.set('maxmemory', String(store.usedMemory + 2));

            const r2 = dispatch(['sadd', 'myset', 'extremely_large_element_exceeding_budget'], ctx);
            assert.ok(r2.includes('-OOM'), `Expected OOM error, got ${r2}`);

            const setVal = store.get(0, 'myset');
            assert.strictEqual(setVal.size, 1);
            assert.strictEqual(setVal.has('elem1'), true);
            assert.strictEqual(setVal.has('extremely_large_element_exceeding_budget'), false);
        });

        it('ZADD does not mutate sorted set if OOM rejected', () => {
            const config = new ServerConfig({
                maxmemory: 500,
                maxmemory_policy: 'noeviction'
            });
            const store = new DataStore(16, config);
            const ctx = makeCtx(store, config);

            const r1 = dispatch(['zadd', 'myzset', '10', 'member1'], ctx);
            assert.strictEqual(r1, ':1\r\n');

            config.set('maxmemory', String(store.usedMemory + 2));

            const r2 = dispatch(['zadd', 'myzset', '20', 'giant_member_exceeding_memory_budget'], ctx);
            assert.ok(r2.includes('-OOM'), `Expected OOM error, got ${r2}`);

            const zsetVal = store.get(0, 'myzset');
            assert.strictEqual(zsetVal.members.size, 1);
            assert.strictEqual(zsetVal.members.get('member1'), 10);
            assert.strictEqual(zsetVal.members.has('giant_member_exceeding_memory_budget'), false);
        });
    });

    describe('P0 Bug 2: Atomic RENAME under memory constraints', () => {
        it('RENAME does not delete source key or lose TTL if destination admission fails', () => {
            const config = new ServerConfig({
                maxmemory: 300,
                maxmemory_policy: 'noeviction'
            });
            const store = new DataStore(16, config);
            const ctx = makeCtx(store, config);

            dispatch(['set', 'sourceKey', 'shortVal'], ctx);
            dispatch(['expire', 'sourceKey', '1000'], ctx);
            const ttlBefore = store.expiry.ttlSec(0, 'sourceKey');
            assert.ok(ttlBefore > 0);

            dispatch(['set', 'targetKey', 'targetVal'], ctx);

            config.set('maxmemory', String(store.usedMemory - 1));

            const longTarget = 'very_long_target_key_name_that_requires_more_memory_than_available';
            const r = dispatch(['rename', 'sourceKey', longTarget], ctx);
            assert.ok(r.includes('-OOM'), `Expected OOM, got: ${r}`);

            assert.strictEqual(store.get(0, 'sourceKey'), 'shortVal');
            const ttlAfter = store.expiry.ttlSec(0, 'sourceKey');
            assert.ok(ttlAfter > 0, 'TTL must still be present on source key');
            assert.strictEqual(store.exists(0, longTarget), false);
        });
    });

    describe('P0 Bug 3: WATCH invalidation with FLUSHDB & FLUSHALL', () => {
        it('aborts transaction if FLUSHDB occurs during WATCH', () => {
            const store = new DataStore(16);
            const conn = { db: 0, id: 1, name: null, txQueue: null, watchedKeys: null, authenticated: true };
            const ctx = makeCtx(store, null, conn);

            dispatch(['set', 'watchKey', 'initialVal'], ctx);

            const rWatch = dispatch(['watch', 'watchKey'], ctx);
            assert.strictEqual(rWatch, '+OK\r\n');

            dispatch(['multi'], ctx);
            dispatch(['set', 'watchKey', 'newVal'], ctx);

            const otherConn = { db: 0, id: 2, name: null, txQueue: null, watchedKeys: null, authenticated: true };
            const otherCtx = makeCtx(store, null, otherConn);
            dispatch(['flushdb'], otherCtx);

            const rExec = dispatch(['exec'], ctx);
            assert.strictEqual(rExec, '*-1\r\n', 'Transaction must abort after FLUSHDB');
        });

        it('aborts transaction if FLUSHALL occurs during WATCH', () => {
            const store = new DataStore(16);
            const conn = { db: 0, id: 1, name: null, txQueue: null, watchedKeys: null, authenticated: true };
            const ctx = makeCtx(store, null, conn);

            dispatch(['set', 'foo', 'bar'], ctx);
            dispatch(['watch', 'foo'], ctx);

            dispatch(['multi'], ctx);
            dispatch(['set', 'foo', 'baz'], ctx);

            const otherCtx = makeCtx(store, null, { db: 1, id: 2, name: null, txQueue: null, watchedKeys: null });
            dispatch(['flushall'], otherCtx);

            const rExec = dispatch(['exec'], ctx);
            assert.strictEqual(rExec, '*-1\r\n', 'Transaction must abort after FLUSHALL');
        });
    });

    describe('P0 Bug 9: Safe snapshot serialization (No plain object prototype collision)', () => {
        const testDir = path.join(__dirname, '.tmp_safe_snapshot_test');
        const rdbFilename = 'safe_snapshot.rdb';

        beforeEach(() => {
            if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir, { recursive: true });
        });

        it('safely serializes and restores keys named __proto__, constructor, and prototype', () => {
            const store = new DataStore(16);
            store.set(0, '__proto__', 'proto_value');
            store.set(0, 'constructor', 'constructor_value');
            store.set(0, 'prototype', 'prototype_value');
            store.set(0, 'normal_key', 'normal_value');

            const cfg = new ServerConfig({ dir: testDir, rdb_filename: rdbFilename });
            const rdb = new RdbPersistence(cfg, store);
            const saved = rdb.save();
            assert.strictEqual(saved, true);

            const newStore = new DataStore(16);
            const newRdb = new RdbPersistence(cfg, newStore);
            const loaded = newRdb.load();
            assert.strictEqual(loaded, true);

            assert.strictEqual(newStore.get(0, '__proto__'), 'proto_value');
            assert.strictEqual(newStore.get(0, 'constructor'), 'constructor_value');
            assert.strictEqual(newStore.get(0, 'prototype'), 'prototype_value');
            assert.strictEqual(newStore.get(0, 'normal_key'), 'normal_value');

            assert.strictEqual(Object.prototype.hasOwnProperty('proto_value'), false);
            assert.strictEqual(({}).proto_value, undefined);

            fs.rmSync(testDir, { recursive: true, force: true });
        });
    });

    describe('P0 Bug 4: TCP traffic routing through CommandGateway', () => {
        let server;
        const TCP_PORT = 16399;

        beforeEach(async () => {
            server = new RedisGenServer({
                port: TCP_PORT,
                requirepass: 'secret123',
                ws_port: 0
            });
            await server.start();
        });

        afterEach(async () => {
            await server.stop();
        });

        it('enforces auth and gateway on raw TCP connection', async () => {
            const client = new net.Socket();
            await new Promise((resolve, reject) => {
                client.connect(TCP_PORT, '127.0.0.1', resolve);
                client.on('error', reject);
            });

            const res1 = await new Promise(resolve => {
                client.once('data', chunk => resolve(chunk.toString()));
                client.write('*1\r\n$4\r\nPING\r\n');
            });
            assert.ok(res1.includes('NOAUTH'), `Expected NOAUTH from Gateway, got: ${res1}`);

            const res2 = await new Promise(resolve => {
                client.once('data', chunk => resolve(chunk.toString()));
                client.write('*2\r\n$4\r\nAUTH\r\n$9\r\nsecret123\r\n');
            });
            assert.ok(res2.includes('+OK'), `Expected +OK for valid AUTH, got: ${res2}`);

            const res3 = await new Promise(resolve => {
                client.once('data', chunk => resolve(chunk.toString()));
                client.write('*1\r\n$4\r\nPING\r\n');
            });
            assert.ok(res3.includes('+PONG'), `Expected +PONG, got: ${res3}`);

            client.destroy();
        });
    });

    describe('P0 Bug 5: Protocol Hardening & Binary-Safety', () => {
        it('preserves arbitrary raw bytes through encoder and returnBuffers parser', () => {
            const binaryData = Buffer.from([0x00, 0x80, 0xff, 0xfe, 0x01, 0x42, 0x00]);
            const encoded = encoder.encodeBulkString(binaryData);
            assert.ok(Buffer.isBuffer(encoded));

            const parser = new RespParser({ returnBuffers: true });
            parser.append(encoded);
            const results = parser.parse();
            assert.strictEqual(results.length, 1);
            assert.ok(Buffer.isBuffer(results[0]));
            assert.strictEqual(results[0].length, binaryData.length);
            assert.deepStrictEqual(results[0], binaryData);
        });

        it('rejects invalid integer grammar strictly', () => {
            const parser = new RespParser();
            parser.append(Buffer.from(':123abc\r\n'));
            assert.throws(() => {
                parser.parse();
            }, /Protocol error: invalid integer/);
        });

        it('rejects negative bulk lengths other than -1', () => {
            const parser = new RespParser();
            parser.append(Buffer.from('$-5\r\n'));
            assert.throws(() => {
                parser.parse();
            }, /Protocol error: invalid bulk length/);
        });

        it('rejects array count exceeding limits', () => {
            const parser = new RespParser();
            parser.append(Buffer.from('*2000000\r\n'));
            assert.throws(() => {
                parser.parse();
            }, /Protocol error: invalid multibulk length/);
        });
    });

    describe('P0 Bug 6 & 7: Binary-Safe & Streaming AOF Recovery', () => {
        const aofDir = path.join(__dirname, '.tmp_aof_test');
        const aofFile = 'binary_stream.aof';
        const aofPath = path.join(aofDir, aofFile);

        beforeEach(() => {
            if (fs.existsSync(aofDir)) {
                fs.rmSync(aofDir, { recursive: true, force: true });
            }
            fs.mkdirSync(aofDir, { recursive: true });
        });

        afterEach(() => {
            if (fs.existsSync(aofDir)) {
                fs.rmSync(aofDir, { recursive: true, force: true });
            }
        });

        it('appends and replays binary-safe Buffer payloads without byte corruption', () => {
            const store = new DataStore(16);
            const cfg = new ServerConfig({ dir: aofDir, aof_filename: aofFile, appendonly: true, appendfsync: 'always' });
            const aof = new AofPersistence(cfg, store);
            aof.open();

            const binaryVal = Buffer.from([0x00, 0xff, 0xc3, 0x28, 0xfe, 0x00, 0x01]);
            aof.appendCommand(['SET', 'binKey', binaryVal]);
            aof.close();

            const newStore = new DataStore(16);
            const aofReplay = new AofPersistence(cfg, newStore);
            const ctx = makeCtx(newStore, cfg);

            const replayed = aofReplay.replay(dispatch, ctx);
            assert.strictEqual(replayed, 1);

            const retrieved = newStore.get(0, 'binKey');
            assert.ok(retrieved !== undefined);
            const retrievedBuf = Buffer.isBuffer(retrieved) ? retrieved : Buffer.from(retrieved);
            assert.deepStrictEqual(retrievedBuf, binaryVal);
        });

        it('handles streaming replay and truncated final records cleanly', () => {
            const store = new DataStore(16);
            const cfg = new ServerConfig({ dir: aofDir, aof_filename: aofFile, appendonly: true, appendfsync: 'always' });
            const aof = new AofPersistence(cfg, store);
            aof.open();

            for (let i = 0; i < 5; i++) {
                aof.appendCommand(['SET', `k${i}`, `v${i}`]);
            }
            aof.close();

            fs.appendFileSync(aofPath, Buffer.from('*2\r\n$3\r\nSET\r\n$2\r\nin'));

            const newStore = new DataStore(16);
            const aofReplay = new AofPersistence(cfg, newStore);
            const ctx = makeCtx(newStore, cfg);

            const replayed = aofReplay.replay(dispatch, ctx);
            assert.strictEqual(replayed, 5, 'Must replay all 5 complete commands despite truncated tail');
            for (let i = 0; i < 5; i++) {
                assert.strictEqual(String(newStore.get(0, `k${i}`)), `v${i}`);
            }
        });
    });
});
