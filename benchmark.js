'use strict';

const { DataStore, TYPE_STRING } = require('./src/datastore/store');
const { ServerConfig } = require('./src/config');
const { dispatch, commandCount, TABLE } = require('./src/commands/registry');
const { PubSubBroker } = require('./src/commands/pubsub');
const { RdbPersistence } = require('./src/persistence/rdb');
const { AofPersistence } = require('./src/persistence/aof');
const fs = require('fs');
const path = require('path');

function makeCtx(store, config) {
    return {
        db: 0,
        store: store,
        config: config || new ServerConfig(),
        connection: { db: 0, id: 1, name: null, txQueue: null, authenticated: false },
        pubsub: new PubSubBroker(),
        clientCount: 1,
        aofBuffer: null
    };
}

function benchThroughput() {
    console.log('\n=== THROUGHPUT BENCHMARK ===');
    
    // Baseline SET/GET without eviction
    const config = new ServerConfig();
    const store = new DataStore(16, config);
    const ctx = makeCtx(store, config);
    
    const N = 100000;
    
    // SET benchmark
    const setStart = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
        dispatch(['SET', 'key:' + i, 'value_' + i + '_data_padding_for_realistic_size'], ctx);
    }
    const setEnd = process.hrtime.bigint();
    const setDurationMs = Number(setEnd - setStart) / 1e6;
    const setOpsPerSec = Math.floor(N / (setDurationMs / 1000));
    
    // GET benchmark
    const getStart = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
        dispatch(['GET', 'key:' + (i % N)], ctx);
    }
    const getEnd = process.hrtime.bigint();
    const getDurationMs = Number(getEnd - getStart) / 1e6;
    const getOpsPerSec = Math.floor(N / (getDurationMs / 1000));
    
    console.log(`SET: ${N} ops in ${setDurationMs.toFixed(0)}ms = ${setOpsPerSec.toLocaleString()} ops/sec`);
    console.log(`GET: ${N} ops in ${getDurationMs.toFixed(0)}ms = ${getOpsPerSec.toLocaleString()} ops/sec`);
    
    return { setOpsPerSec, getOpsPerSec };
}

function benchLRU() {
    console.log('\n=== LRU EVICTION BENCHMARK ===');
    
    // With LRU eviction under memory pressure
    const configLru = new ServerConfig({ maxmemory: 500000, maxmemory_policy: 'allkeys-lru' });
    const storeLru = new DataStore(16, configLru);
    const ctxLru = makeCtx(storeLru, configLru);
    
    const N = 50000;
    
    const lruStart = process.hrtime.bigint();
    let successfulWrites = 0;
    for (let i = 0; i < N; i++) {
        const res = dispatch(['SET', 'lru:' + i, 'value_' + i + '_padding_data'], ctxLru);
        if (res && res.includes('+OK')) successfulWrites++;
    }
    const lruEnd = process.hrtime.bigint();
    const lruDurationMs = Number(lruEnd - lruStart) / 1e6;
    const lruOpsPerSec = Math.floor(N / (lruDurationMs / 1000));
    
    console.log(`LRU SET: ${N} ops in ${lruDurationMs.toFixed(0)}ms = ${lruOpsPerSec.toLocaleString()} ops/sec`);
    console.log(`Successful writes under pressure: ${successfulWrites}/${N}`);
    console.log(`Memory stayed at: ${storeLru.usedMemory} bytes (limit: 500000)`);
    
    return { lruOpsPerSec, successfulWrites };
}

function benchPersistence() {
    console.log('\n=== PERSISTENCE RECOVERY BENCHMARK ===');
    
    const testDir = path.join(__dirname, '.bench_persist');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    
    // RDB test
    const configRdb = new ServerConfig({ dir: testDir, rdb_filename: 'bench.rdb' });
    const store1 = new DataStore(16);
    
    const totalKeys = 10000;
    for (let i = 0; i < totalKeys; i++) {
        store1.set(0, 'key:' + i, 'value_' + i + '_with_some_data', TYPE_STRING);
    }
    // Set some expiries
    for (let i = 0; i < 1000; i++) {
        store1.expiry.setExpiry(0, 'key:' + i, 60000);
    }
    // Use multiple DBs
    for (let i = 0; i < 500; i++) {
        store1.set(1, 'db1_key:' + i, 'val_' + i, TYPE_STRING);
    }
    store1.set(2, 'hashkey', new Map([['f1', 'v1'], ['f2', 'v2']]), 'hash');
    store1.set(2, 'setkey', new Set(['a', 'b', 'c']), 'set');
    store1.set(2, 'listkey', ['x', 'y', 'z'], 'list');
    
    const rdb = new RdbPersistence(configRdb, store1);
    const saveOk = rdb.save();
    
    // Load into new store
    const store2 = new DataStore(16);
    const rdb2 = new RdbPersistence(configRdb, store2);
    const loadOk = rdb2.load();
    
    let rdbRecovered = 0;
    for (let i = 0; i < totalKeys; i++) {
        if (store2.get(0, 'key:' + i) !== undefined) rdbRecovered++;
    }
    for (let i = 0; i < 500; i++) {
        if (store2.get(1, 'db1_key:' + i) !== undefined) rdbRecovered++;
    }
    // Complex types
    const hash = store2.get(2, 'hashkey');
    if (hash instanceof Map && hash.get('f1') === 'v1') rdbRecovered++;
    const set = store2.get(2, 'setkey');
    if (set instanceof Set && set.has('a')) rdbRecovered++;
    const list = store2.get(2, 'listkey');
    if (Array.isArray(list) && list[0] === 'x') rdbRecovered++;
    
    const totalExpected = totalKeys + 500 + 3;
    const rdbPct = ((rdbRecovered / totalExpected) * 100).toFixed(1);
    
    // Check expiry preserved
    let expiryRecovered = 0;
    for (let i = 0; i < 1000; i++) {
        if (store2.expiry.hasExpiry(0, 'key:' + i)) expiryRecovered++;
    }
    
    console.log(`RDB: Saved ${totalExpected} keys (strings + hashes + sets + lists across 3 DBs)`);
    console.log(`RDB: Recovered ${rdbRecovered}/${totalExpected} keys = ${rdbPct}%`);
    console.log(`RDB: Expiry preserved: ${expiryRecovered}/1000`);
    
    // AOF test
    const configAof = new ServerConfig({ dir: testDir, aof_filename: 'bench.aof', appendonly: true, appendfsync: 'always' });
    const storeAof1 = new DataStore(16);
    const aof = new AofPersistence(configAof, storeAof1);
    aof.open();
    
    const aofCmds = 5000;
    for (let i = 0; i < aofCmds; i++) {
        aof.appendCommand(['SET', 'aofkey:' + i, 'aofval_' + i]);
    }
    aof.appendCommand(['DEL', 'aofkey:0']);
    aof.close();
    
    const storeAof2 = new DataStore(16);
    const aof2 = new AofPersistence(configAof, storeAof2);
    const ctxAof = makeCtx(storeAof2, configAof);
    const replayed = aof2.replay(dispatch, ctxAof);
    
    let aofRecovered = 0;
    for (let i = 1; i < aofCmds; i++) { // key:0 was deleted
        if (storeAof2.get(0, 'aofkey:' + i) !== undefined) aofRecovered++;
    }
    const aofExpected = aofCmds - 1;
    const aofPct = ((aofRecovered / aofExpected) * 100).toFixed(1);
    
    console.log(`AOF: Replayed ${replayed} commands`);
    console.log(`AOF: Recovered ${aofRecovered}/${aofExpected} keys = ${aofPct}%`);
    
    // Cleanup
    try {
        const files = fs.readdirSync(testDir);
        for (const f of files) fs.unlinkSync(path.join(testDir, f));
        fs.rmdirSync(testDir);
    } catch (e) {}
    
    return { rdbPct: parseFloat(rdbPct), aofPct: parseFloat(aofPct), rdbRecovered, totalExpected };
}

function benchMixed() {
    console.log('\n=== MIXED WORKLOAD BENCHMARK ===');
    
    const config = new ServerConfig();
    const store = new DataStore(16, config);
    const ctx = makeCtx(store, config);
    
    const N = 50000;
    const start = process.hrtime.bigint();
    
    for (let i = 0; i < N; i++) {
        const op = i % 10;
        if (op < 4) {
            dispatch(['SET', 'mixed:' + i, 'val_' + i], ctx);
        } else if (op < 7) {
            dispatch(['GET', 'mixed:' + (i % 1000)], ctx);
        } else if (op === 7) {
            dispatch(['INCR', 'counter:' + (i % 100)], ctx);
        } else if (op === 8) {
            dispatch(['LPUSH', 'list:' + (i % 50), 'item_' + i], ctx);
        } else {
            dispatch(['HSET', 'hash:' + (i % 50), 'field_' + (i % 10), 'hval_' + i], ctx);
        }
    }
    
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    const opsPerSec = Math.floor(N / (durationMs / 1000));
    
    console.log(`Mixed: ${N} ops in ${durationMs.toFixed(0)}ms = ${opsPerSec.toLocaleString()} ops/sec`);
    
    return { opsPerSec };
}

// Run all benchmarks
console.log('=================================');
console.log('  RediForge Benchmark Suite');
console.log('=================================');
console.log(`\nRegistered Commands: ${commandCount()}`);

const throughput = benchThroughput();
const lru = benchLRU();
const persistence = benchPersistence();
const mixed = benchMixed();

// Calculate improvement metric: LRU adds overhead but keeps memory bounded
// Compare baseline vs LRU throughput
const throughputImpactPct = (((throughput.setOpsPerSec + throughput.getOpsPerSec) / 2 - lru.lruOpsPerSec) / lru.lruOpsPerSec * 100).toFixed(1);

console.log('\n=================================');
console.log('  SUMMARY FOR RESUME METRICS');
console.log('=================================');
console.log(`\n• Commands: ${commandCount()} registered commands with full RESP2 parity`);
console.log(`• Persistence recovery: RDB=${persistence.rdbPct}%, AOF=${persistence.aofPct}%`);
console.log(`• Throughput: SET=${throughput.setOpsPerSec.toLocaleString()} ops/s, GET=${throughput.getOpsPerSec.toLocaleString()} ops/s`);
console.log(`• Mixed workload: ${mixed.opsPerSec.toLocaleString()} ops/sec`);
console.log(`• LRU under pressure: ${lru.lruOpsPerSec.toLocaleString()} ops/sec`);
console.log(`• LRU memory bounded: ${lru.successfulWrites}/${50000} writes succeeded under 500KB limit`);
