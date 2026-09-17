const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');
const { Resp2Client } = require('../dist/main/resp2/client');

describe('RediForge Desktop RESP2 Client E2E Integration', () => {
  let serverProcess;
  let client;
  const PORT = 6382;

  before(async () => {

    const serverPath = path.resolve(__dirname, '../../src/server.js');
    serverProcess = spawn(process.execPath, [serverPath, '--port', String(PORT)], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for RediForge server to start'));
      }, 5000);

      serverProcess.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('RediForge') || text.includes('ready') || text.includes('listening')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    await new Promise((r) => setTimeout(r, 200));

    client = new Resp2Client({
      host: '127.0.0.1',
      port: PORT,
      autoReconnect: false,
    });
    await client.connect();
  });

  after(() => {
    if (client) {
      client.disconnect();
    }
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

  it('connects and receives PONG from PING', async () => {
    const res = await client.sendCommand('PING');
    assert.strictEqual(res, 'PONG');
  });

  it('sets and gets a string key', async () => {
    const setRes = await client.sendCommand('SET', 'e2e:greeting', 'Hello RediForge!');
    assert.strictEqual(setRes, 'OK');

    const getRes = await client.sendCommand('GET', 'e2e:greeting');
    assert.strictEqual(getRes, 'Hello RediForge!');
  });

  it('performs hash operations (HSET, HGET, HGETALL)', async () => {
    await client.sendCommand('HSET', 'e2e:user', 'name', 'Ashutosh', 'role', 'Architect');
    const name = await client.sendCommand('HGET', 'e2e:user', 'name');
    assert.strictEqual(name, 'Ashutosh');

    const all = await client.sendCommand('HGETALL', 'e2e:user');
    assert(Array.isArray(all));
    assert(all.includes('name'));
    assert(all.includes('Ashutosh'));
  });

  it('performs list operations (RPUSH, LRANGE, LLEN)', async () => {
    await client.sendCommand('RPUSH', 'e2e:list', 'item1', 'item2', 'item3');
    const len = await client.sendCommand('LLEN', 'e2e:list');
    assert.strictEqual(len, 3);

    const items = await client.sendCommand('LRANGE', 'e2e:list', '0', '-1');
    assert.deepStrictEqual(items, ['item1', 'item2', 'item3']);
  });

  it('performs set operations (SADD, SMEMBERS, SISMEMBER)', async () => {
    await client.sendCommand('SADD', 'e2e:set', 'alpha', 'beta', 'gamma');
    const isMember = await client.sendCommand('SISMEMBER', 'e2e:set', 'beta');
    assert.strictEqual(isMember, 1);

    const members = await client.sendCommand('SMEMBERS', 'e2e:set');
    assert(Array.isArray(members));
    assert(members.includes('alpha'));
  });

  it('scans keys with cursor', async () => {
    const scanRes = await client.sendCommand('SCAN', '0', 'MATCH', 'e2e:*', 'COUNT', '1000');
    assert(Array.isArray(scanRes));
    assert.strictEqual(scanRes.length, 2);
    const foundKeys = scanRes[1];
    assert(Array.isArray(foundKeys));
    assert(foundKeys.length >= 3);
  });

  it('retrieves server INFO and parses sections', async () => {
    const info = await client.sendCommand('INFO');
    assert(typeof info === 'string');
    assert(info.includes('# Server'));
    assert(info.includes('# Memory'));
    assert(info.includes('redis_version'));
  });

  it('switches database with SELECT', async () => {
    const selectRes = await client.sendCommand('SELECT', '2');
    assert.strictEqual(selectRes, 'OK');

    await client.sendCommand('SET', 'e2e:db2key', 'value_in_db2');
    const val = await client.sendCommand('GET', 'e2e:db2key');
    assert.strictEqual(val, 'value_in_db2');

    await client.sendCommand('SELECT', '0');
    const missing = await client.sendCommand('GET', 'e2e:db2key');
    assert.strictEqual(missing, null);
  });
});
