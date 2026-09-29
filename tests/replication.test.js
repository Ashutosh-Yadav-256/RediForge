'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const net = require('net');
const { ReplicationBacklog } = require('../src/replication/backlog');
const { PrimaryReplication } = require('../src/replication/primary');
const { ReplicaReplication } = require('../src/replication/replica');
const { RedisGenServer } = require('../src/server');
const { DataStore, TYPE_STRING } = require('../src/datastore/store');

describe('Replication Subsystem', () => {
    describe('Replication Backlog', () => {
        it('tracks firstOffset and currentOffset and slices accurately', () => {
            const backlog = new ReplicationBacklog(1024);
            const chunk1 = Buffer.from('COMMAND_1;');
            const chunk2 = Buffer.from('COMMAND_2;');

            backlog.append(chunk1);
            assert.strictEqual(backlog.firstOffset, 0);
            assert.strictEqual(backlog.currentOffset, chunk1.length);
            assert.strictEqual(backlog.canProvide(0), true);
            assert.strictEqual(backlog.canProvide(chunk1.length), true);

            backlog.append(chunk2);
            assert.strictEqual(backlog.currentOffset, chunk1.length + chunk2.length);

            const slice = backlog.sliceFrom(chunk1.length);
            assert.ok(slice.equals(chunk2));
        });

        it('discards oldest bytes on overflow and updates firstOffset', () => {
            const backlog = new ReplicationBacklog(20);
            backlog.append(Buffer.from('0123456789'));
            assert.strictEqual(backlog.firstOffset, 0);
            assert.strictEqual(backlog.currentOffset, 10);

            backlog.append(Buffer.from('abcdefghij'));
            assert.strictEqual(backlog.firstOffset, 0);
            assert.strictEqual(backlog.currentOffset, 20);

            backlog.append(Buffer.from('KLMNO'));
            assert.strictEqual(backlog.firstOffset, 5);
            assert.strictEqual(backlog.currentOffset, 25);
            assert.strictEqual(backlog.buffer.length, 20);

            assert.strictEqual(backlog.canProvide(0), false);
            assert.strictEqual(backlog.canProvide(5), true);
        });
    });

    describe('Primary <-> Replica Live Synchronization', () => {
        let primaryServer, replicaServer, replicaClient;
        const PRIMARY_PORT = 19451;
        const REPLICA_PORT = 19452;

        beforeEach((t, done) => {
            primaryServer = new RedisGenServer({
                port: PRIMARY_PORT,
                bind: '127.0.0.1',
                loglevel: 'warning',
                appendonly: false,
                replBacklogSize: 1024 * 1024,
                ws_port: 0
            });
            primaryServer.start();

            replicaServer = new RedisGenServer({
                port: REPLICA_PORT,
                bind: '127.0.0.1',
                loglevel: 'warning',
                appendonly: false,
                ws_port: 0
            });

            replicaClient = new ReplicaReplication(replicaServer);
            replicaServer.replica = replicaClient;

            setTimeout(done, 150);
        });

        afterEach((t, done) => {
            if (replicaClient) replicaClient.disconnect();
            if (primaryServer) {
                primaryServer.stop();
            }
            if (replicaServer) {
                replicaServer.stop();
            }
            setTimeout(done, 150);
        });

        it('Full Resync: replica initializes from primary snapshot', (t, done) => {
            primaryServer.store.set(0, 'init_str', 'val_alpha', TYPE_STRING);
            primaryServer.store.hashSet(0, 'init_hash', [['key1', 'val1']]);
            primaryServer.store.listPushRight(0, 'init_list', ['itemA', 'itemB']);

            replicaClient.connect('127.0.0.1', PRIMARY_PORT, (err, resyncInfo) => {
                assert.ifError(err);
                assert.strictEqual(resyncInfo.type, 'FULLRESYNC');

                setTimeout(() => {
                    assert.strictEqual(replicaServer.store.get(0, 'init_str'), 'val_alpha');
                    const hash = replicaServer.store.get(0, 'init_hash');
                    assert.ok(hash);
                    assert.strictEqual(hash.get('key1'), 'val1');
                    const list = replicaServer.store.get(0, 'init_list');
                    assert.strictEqual(list.length, 2);
                    done();
                }, 100);
            });
        });

        it('Live Stream: primary mutations stream to connected replica in real time', (t, done) => {
            replicaClient.connect('127.0.0.1', PRIMARY_PORT, (err, resyncInfo) => {
                assert.ifError(err);

                setTimeout(() => {
                    primaryServer.store.set(0, 'live_key', 'live_data', TYPE_STRING);
                    primaryServer.store.listPushRight(0, 'live_list', ['stream1', 'stream2']);

                    setTimeout(() => {
                        assert.strictEqual(replicaServer.store.get(0, 'live_key'), 'live_data');
                        const list = replicaServer.store.get(0, 'live_list');
                        assert.ok(list);
                        assert.strictEqual(list.length, 2);
                        done();
                    }, 100);
                }, 100);
            });
        });

        it('Partial Resync: replica disconnects, reconnects with PSYNC, and receives delta from backlog', (t, done) => {
            primaryServer.store.set(0, 'base', 'initial', TYPE_STRING);

            replicaClient.connect('127.0.0.1', PRIMARY_PORT, (err1, resync1) => {
                assert.ifError(err1);
                assert.strictEqual(resync1.type, 'FULLRESYNC');

                setTimeout(() => {
                    const savedReplId = replicaClient.masterReplicationId;
                    const savedOffset = replicaClient.receivedOffset;

                    replicaClient.disconnect();

                    primaryServer.store.set(0, 'outage_key1', 'outage_val1', TYPE_STRING);
                    primaryServer.store.set(0, 'outage_key2', 'outage_val2', TYPE_STRING);

                    const reconnectClient = new ReplicaReplication(replicaServer);
                    reconnectClient.masterReplicationId = savedReplId;
                    reconnectClient.receivedOffset = savedOffset;

                    reconnectClient.connect('127.0.0.1', PRIMARY_PORT, (err2, resync2) => {
                        assert.ifError(err2);
                        assert.strictEqual(resync2.type, 'CONTINUE');

                        setTimeout(() => {
                            assert.strictEqual(replicaServer.store.get(0, 'base'), 'initial');
                            assert.strictEqual(replicaServer.store.get(0, 'outage_key1'), 'outage_val1');
                            assert.strictEqual(replicaServer.store.get(0, 'outage_key2'), 'outage_val2');
                            reconnectClient.disconnect();
                            done();
                        }, 100);
                    });
                }, 100);
            });
        });

        it('Backlog Overflow Fallback: reconnect with expired offset triggers Full Resync', (t, done) => {
            primaryServer.primary.backlog = new ReplicationBacklog(100);

            primaryServer.store.set(0, 'k0', 'v0', TYPE_STRING);

            replicaClient.connect('127.0.0.1', PRIMARY_PORT, (err1, resync1) => {
                assert.ifError(err1);
                assert.strictEqual(resync1.type, 'FULLRESYNC');

                setTimeout(() => {
                    const savedReplId = replicaClient.masterReplicationId;
                    const savedOffset = replicaClient.receivedOffset;

                    replicaClient.disconnect();

                    for (let i = 0; i < 20; i++) {
                        primaryServer.store.set(0, 'overflow:' + i, 'val:' + i, TYPE_STRING);
                    }

                    const reconnectClient = new ReplicaReplication(replicaServer);
                    reconnectClient.masterReplicationId = savedReplId;
                    reconnectClient.receivedOffset = savedOffset;

                    reconnectClient.connect('127.0.0.1', PRIMARY_PORT, (err2, resync2) => {
                        assert.ifError(err2);
                        assert.strictEqual(resync2.type, 'FULLRESYNC');

                        setTimeout(() => {
                            assert.strictEqual(replicaServer.store.get(0, 'overflow:19'), 'val:19');
                            reconnectClient.disconnect();
                            done();
                        }, 100);
                    });
                }, 100);
            });
        });

        it('Tracks replica lag and updates INFO replication metrics', (t, done) => {
            replicaClient.connect('127.0.0.1', PRIMARY_PORT, (err) => {
                assert.ifError(err);

                setTimeout(() => {
                    primaryServer.store.set(0, 'm1', 'v1', TYPE_STRING);

                    const info = primaryServer.primary.getInfo();
                    assert.ok(info.includes('role:master'));
                    assert.ok(info.includes('connected_slaves:1'));
                    assert.ok(info.includes('master_repl_offset:'));
                    done();
                }, 100);
            });
        });
    });
});
