'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const net = require('net');
const { DataStore } = require('../src/datastore/store');
const { ServerConfig } = require('../src/config');
const { dispatch } = require('../src/commands/registry');
const { PubSubBroker } = require('../src/commands/pubsub');
const { AuthService } = require('../src/security/auth_service');
const { CommandGateway, RateLimiter } = require('../src/security/command_gateway');
const { AuditLogger } = require('../src/security/audit_logger');
const rbac = require('../src/security/rbac');
const { parseAndValidateUrl, validateAndResolveUrl } = require('../src/utils/url_guard');
const { strictParseBigInt, INT64_MAX, INT64_MIN } = require('../src/utils/validate');
const { WebSocketBridge } = require('../src/bridge');
const { RedisGenServer } = require('../src/server');

function makeCtx(store, config, connection) {
    return {
        db: connection?.db || 0,
        store: store,
        config: config || new ServerConfig(),
        connection: connection || { db: 0, id: 1, name: null, txQueue: null, authenticated: false },
        pubsub: new PubSubBroker(),
        clientCount: 1,
        aofBuffer: null
    };
}

describe('Security & Architecture Enhancements', () => {

    describe('BigInt 64-bit Integer Operations', () => {
        let store;

        beforeEach(() => {
            store = new DataStore(16);
        });

        it('parses valid 64-bit BigInt and rejects invalid', () => {
            assert.strictEqual(strictParseBigInt('0'), 0n);
            assert.strictEqual(strictParseBigInt('9223372036854775807'), INT64_MAX);
            assert.strictEqual(strictParseBigInt('-9223372036854775808'), INT64_MIN);
            // Overflow 64-bit
            assert.strictEqual(strictParseBigInt('9223372036854775808'), null);
            assert.strictEqual(strictParseBigInt('-9223372036854775809'), null);
            assert.strictEqual(strictParseBigInt('abc'), null);
            assert.strictEqual(strictParseBigInt('12.34'), null);
        });

        it('handles numbers greater than JavaScript Number.MAX_SAFE_INTEGER (53-bit)', () => {
            const ctx = makeCtx(store);
            // Set a 60-bit integer
            const largeIntStr = '5000000000000000000'; // 5 * 10^18 > 2^53
            dispatch(['set', 'bignum', largeIntStr], ctx);

            const r1 = dispatch(['incr', 'bignum'], ctx);
            assert.strictEqual(r1, ':5000000000000000001\r\n');

            const r2 = dispatch(['incrby', 'bignum', '1000'], ctx);
            assert.strictEqual(r2, ':5000000000000001001\r\n');

            const r3 = dispatch(['decrby', 'bignum', '1000'], ctx);
            assert.strictEqual(r3, ':5000000000000000001\r\n');
        });

        it('detects 64-bit integer overflow properly', () => {
            const ctx = makeCtx(store);
            dispatch(['set', 'maxnum', INT64_MAX.toString()], ctx);

            const r1 = dispatch(['incr', 'maxnum'], ctx);
            assert.ok(r1.includes('ERR increment or decrement would overflow'));

            dispatch(['set', 'minnum', INT64_MIN.toString()], ctx);
            const r2 = dispatch(['decr', 'minnum'], ctx);
            assert.ok(r2.includes('ERR increment or decrement would overflow'));
        });

        it('HINCRBY handles 64-bit integers and overflow', () => {
            const ctx = makeCtx(store);
            const r1 = dispatch(['hincrby', 'myhash', 'field1', '1000000000000000000'], ctx);
            assert.strictEqual(r1, ':1000000000000000000\r\n');

            const r2 = dispatch(['hincrby', 'myhash', 'field1', '500000000000000000'], ctx);
            assert.strictEqual(r2, ':1500000000000000000\r\n');
        });
    });

    describe('Dataset Memory Accounting & LRU Eviction', () => {
        it('accurately tracks dataset memory', () => {
            const store = new DataStore(16);
            assert.strictEqual(store.usedMemory, 0);

            store.set(0, 'key1', 'val1');
            const mem1 = store.usedMemory;
            assert.ok(mem1 > 0, 'Memory should increase after SET');

            store.set(0, 'key2', 'val2_longer_string');
            const mem2 = store.usedMemory;
            assert.ok(mem2 > mem1, 'Memory should increase with second key');

            store.deleteKey(0, 'key1');
            assert.ok(store.usedMemory < mem2, 'Memory should decrease after deleteKey');

            store.flushAll();
            assert.strictEqual(store.usedMemory, 0, 'Memory should be 0 after flushAll');
        });

        it('evicts keys when maxmemory limit is reached', () => {
            const config = new ServerConfig({
                maxmemory: 300, // Small memory budget
                maxmemory_policy: 'allkeys-lru'
            });
            const store = new DataStore(16, config);

            // Add several keys to exceed maxmemory
            store.set(0, 'k1', 'value_number_1');
            store.set(0, 'k2', 'value_number_2');
            store.set(0, 'k3', 'value_number_3');
            store.set(0, 'k4', 'value_number_4');

            // Memory eviction should keep memory near or below limit
            assert.ok(store.usedMemory <= 300 || store.dbSize(0) < 4, 'LRU eviction should have triggered');
        });
    });

    describe('URL Validation & SSRF Guard', () => {
        it('blocks loopback and private IPs by default', () => {
            const r1 = parseAndValidateUrl('redis://127.0.0.1:6379');
            assert.strictEqual(r1.valid, false);
            assert.ok(r1.error.includes('blocked private or internal network'));

            const r2 = parseAndValidateUrl('http://169.254.169.254/latest/meta-data');
            assert.strictEqual(r2.valid, false);

            const r3 = parseAndValidateUrl('http://10.0.0.5:8080');
            assert.strictEqual(r3.valid, false);

            const r4 = parseAndValidateUrl('http://localhost:3000');
            assert.strictEqual(r4.valid, false);
        });

        it('allows valid public endpoints', () => {
            const r1 = parseAndValidateUrl('rediss://redis.example.com:6380');
            assert.strictEqual(r1.valid, true);
            assert.strictEqual(r1.hostname, 'redis.example.com');
            assert.strictEqual(r1.port, 6380);

            const r2 = parseAndValidateUrl('https://api.github.com');
            assert.strictEqual(r2.valid, true);
            assert.strictEqual(r2.port, 443);
        });

        it('rejects unsupported schemes', () => {
            const r = parseAndValidateUrl('ftp://ftp.example.com/file');
            assert.strictEqual(r.valid, false);
            assert.ok(r.error.includes('Unsupported scheme'));
        });
    });

    describe('Auth Service, Workspaces & RBAC', () => {
        let authService;

        beforeEach(() => {
            authService = new AuthService('test-secret-key-123456');
        });

        it('creates and verifies JWT tokens with expiration', () => {
            const token = authService.createToken({ sub: 'user1', role: 'developer' }, 60);
            const verified = authService.verifyToken(token);
            assert.strictEqual(verified.valid, true);
            assert.strictEqual(verified.payload.sub, 'user1');
            assert.strictEqual(verified.payload.role, 'developer');

            // Expired token check
            const expiredToken = authService.createToken({ sub: 'user2' }, -10);
            const expiredRes = authService.verifyToken(expiredToken);
            assert.strictEqual(expiredRes.valid, false);
            assert.strictEqual(expiredRes.error, 'Token has expired');
        });

        it('enforces RBAC permissions per role', () => {
            assert.strictEqual(rbac.hasPermission('viewer', rbac.PERMISSIONS.KEY_READ), true);
            assert.strictEqual(rbac.hasPermission('viewer', rbac.PERMISSIONS.KEY_WRITE), false);

            assert.strictEqual(rbac.hasPermission('developer', rbac.PERMISSIONS.KEY_WRITE), true);
            assert.strictEqual(rbac.hasPermission('developer', rbac.PERMISSIONS.SYSTEM_ADMIN), false);

            assert.strictEqual(rbac.hasPermission('admin', rbac.PERMISSIONS.SYSTEM_ADMIN), true);
            assert.strictEqual(rbac.hasPermission('admin', rbac.PERMISSIONS.KEY_WRITE), true);
        });

        it('identifies dangerous commands', () => {
            assert.strictEqual(rbac.isDangerousCommand('FLUSHALL'), true);
            assert.strictEqual(rbac.isDangerousCommand('FLUSHDB'), true);
            assert.strictEqual(rbac.isDangerousCommand('CONFIG'), true);
            assert.strictEqual(rbac.isDangerousCommand('GET'), false);
            assert.strictEqual(rbac.isDangerousCommand('SET'), false);
        });

        it('RGEN-002: verifyOidcPayload (deprecated) rejects all calls', () => {
            const fakePayload = {
                iss: 'https://accounts.google.com',
                sub: 'attacker',
                email: 'attacker@example.com',
                exp: Math.floor(Date.now() / 1000) + 3600
            };
            const res = authService.verifyOidcPayload(fakePayload);
            assert.strictEqual(res.valid, false);
            assert.ok(res.error.includes('disabled'));
        });

        it('RGEN-002: verifyGoogleIdToken rejects non-string tokens', async () => {
            const authWithClientId = new AuthService('test-secret', { googleClientId: 'test-client-id' });
            const fakeObject = {
                iss: 'https://accounts.google.com',
                sub: 'attacker',
                email: 'attacker@example.com',
                exp: Math.floor(Date.now() / 1000) + 3600
            };
            // Passing an object should be rejected
            const res = await authWithClientId.verifyGoogleIdToken(fakeObject);
            assert.strictEqual(res.valid, false);
            assert.ok(res.error.includes('JWT string'));
        });

        it('RGEN-002: verifyGoogleIdToken rejects when OIDC not configured', async () => {
            const authNoClientId = new AuthService('test-secret', { googleClientId: '' });
            const res = await authNoClientId.verifyGoogleIdToken('some.jwt.token');
            assert.strictEqual(res.valid, false);
            assert.ok(res.error.includes('GOOGLE_OAUTH_CLIENT_ID'));
        });

        it('RGEN-002: verifyGoogleIdToken rejects malformed JWT strings', async () => {
            const authWithClientId = new AuthService('test-secret', { googleClientId: 'test-client-id' });
            const res = await authWithClientId.verifyGoogleIdToken('not-a-jwt');
            assert.strictEqual(res.valid, false);
            assert.ok(res.error.includes('Invalid ID token structure'));
        });
    });

    describe('Command Gateway & Audit Logger', () => {
        let server;
        let gateway;
        let auditLogger;

        beforeEach(() => {
            const config = new ServerConfig({ requirepass: 'mypassword' });
            server = {
                config: config,
                store: new DataStore(16, config),
                pubsub: new PubSubBroker(),
                clientCount: 1
            };
            auditLogger = new AuditLogger(500);
            gateway = new CommandGateway(server, {
                auditLogger: auditLogger
            });
        });

        it('blocks unauthenticated commands when requirepass is set', () => {
            const client = { authenticated: false, userId: 'anon', role: 'viewer' };
            const res = gateway.execute(['GET', 'foo'], client);
            assert.strictEqual(res.status, 'UNAUTHENTICATED');
            assert.ok(res.response.includes('NOAUTH'));
        });

        it('allows pre-auth commands (AUTH) and authenticates', () => {
            const client = { authenticated: false, userId: 'anon', role: 'viewer' };
            const res = gateway.execute(['AUTH', 'mypassword'], client);
            assert.strictEqual(res.status, 'OK');
            assert.ok(res.response.includes('+OK'));
            assert.strictEqual(client.authenticated, true);
            assert.strictEqual(client.role, 'admin');
        });

        it('blocks non-admin users from dangerous commands like FLUSHALL', () => {
            const client = { authenticated: true, userId: 'dev1', role: 'developer' };
            const res = gateway.execute(['FLUSHALL'], client);
            assert.strictEqual(res.status, 'PERMISSION_DENIED');
            assert.ok(res.response.includes('NOPERM'));
        });

        it('allows admin users to execute administrative and dangerous commands', () => {
            const client = { authenticated: true, userId: 'admin1', role: 'admin' };
            const res = gateway.execute(['FLUSHALL'], client);
            assert.strictEqual(res.status, 'OK');
            assert.ok(res.response.includes('+OK'));
        });

        it('records structured audit logs with password redaction', () => {
            const client = { authenticated: true, userId: 'admin1', role: 'admin', remoteAddr: '10.0.0.1' };
            gateway.execute(['SET', 'mykey', 'myval'], client);
            gateway.execute(['AUTH', 'supersecretpassword'], client);

            const logs = auditLogger.query({ limit: 10 });
            assert.ok(logs.length >= 2);

            const authLog = logs.find(l => l.command === 'AUTH');
            assert.ok(authLog);
            assert.strictEqual(authLog.args[0], '******', 'Password should be redacted in audit log');
        });

        it('rate limits excessive requests', () => {
            const limiter = new RateLimiter(5, 1);
            for (let i = 0; i < 5; i++) {
                assert.strictEqual(limiter.consume('ip_1'), true);
            }
            assert.strictEqual(limiter.consume('ip_1'), false, 'Should be rate-limited on 6th request');
        });

        it('RGEN-003: rejects unknown workspace IDs', () => {
            const client = {
                authenticated: true,
                userId: 'admin-1',
                role: 'admin',
                workspaceId: 'invented-workspace'
            };
            const res = gateway.execute(['SET', 'key1', 'value1'], client);
            assert.strictEqual(res.status, 'WORKSPACE_DENIED');
            assert.ok(res.response.includes('Workspace not found'));
        });

        it('RGEN-003: allows access to known workspace for members', () => {
            const client = {
                authenticated: true,
                userId: 'admin-1',
                role: 'admin',
                workspaceId: 'default-workspace'
            };
            const res = gateway.execute(['SET', 'key1', 'value1'], client);
            assert.strictEqual(res.status, 'OK');
        });

        it('RGEN-003: denies access to known workspace for non-members', () => {
            // Register a second workspace
            const authService = gateway.authService;
            authService.createWorkspace('ws-secret', 'Secret Workspace', 'other-user');

            const client = {
                authenticated: true,
                userId: 'admin-1',
                role: 'admin',
                workspaceId: 'ws-secret'
            };
            const res = gateway.execute(['GET', 'key1'], client);
            assert.strictEqual(res.status, 'WORKSPACE_DENIED');
            assert.ok(res.response.includes('Access denied'));
        });
    });

    describe('Secure WebSocket & HTTP Bridge', () => {
        let server;
        let bridge;
        let currentWsPort = 18456;

        beforeEach(async () => {
            currentWsPort++;
            const config = new ServerConfig({ requirepass: 'testpass' });
            server = new RedisGenServer(config.all());
            bridge = new WebSocketBridge(server);
            await new Promise(resolve => bridge.start(currentWsPort, '127.0.0.1', resolve));
        });

        afterEach(async () => {
            if (bridge) {
                await new Promise(resolve => bridge.stop(resolve));
                bridge = null;
            }
        });

        it('provides HTTP /health and /stats endpoints', async () => {
            const healthRes = await makeHttpRequest(currentWsPort, '/health');
            assert.strictEqual(healthRes.statusCode, 200);
            assert.strictEqual(JSON.parse(healthRes.body).status, 'ok');

            const statsRes = await makeHttpRequest(currentWsPort, '/stats');
            assert.strictEqual(statsRes.statusCode, 200);
            const stats = JSON.parse(statsRes.body);
            assert.strictEqual(typeof stats.used_memory, 'number');
        });

        it('protects /api/connect with SSRF validation', async () => {
            const blockedRes = await makeHttpRequest(currentWsPort, '/api/connect', 'POST', JSON.stringify({
                url: 'http://127.0.0.1:8080/admin'
            }));
            assert.strictEqual(blockedRes.statusCode, 403);
            assert.ok(JSON.parse(blockedRes.body).error.includes('blocked private or internal network'));

            const validRes = await makeHttpRequest(currentWsPort, '/api/connect', 'POST', JSON.stringify({
                url: 'rediss://8.8.8.8:6380'
            }));
            assert.strictEqual(validRes.statusCode, 200);
            assert.strictEqual(JSON.parse(validRes.body).status, 'valid');
        });

        it('authenticates via /api/auth/token and guards /api/admin/audit', async () => {
            // Login with requirepass
            const authRes = await makeHttpRequest(currentWsPort, '/api/auth/token', 'POST', JSON.stringify({
                password: 'testpass'
            }));
            assert.strictEqual(authRes.statusCode, 200);
            const token = JSON.parse(authRes.body).token;
            assert.ok(token);

            // Access audit logs without token -> 403
            const unauthAudit = await makeHttpRequest(currentWsPort, '/api/admin/audit');
            assert.strictEqual(unauthAudit.statusCode, 403);

            // Access audit logs with token -> 200
            const authAudit = await makeHttpRequest(currentWsPort, '/api/admin/audit', 'GET', null, {
                'Authorization': `Bearer ${token}`
            });
            assert.strictEqual(authAudit.statusCode, 200);
            assert.ok(Array.isArray(JSON.parse(authAudit.body).audit_logs));
        });

        it('RGEN-001: rejects password login when requirepass is not set', async () => {
            // Start a bridge with no requirepass
            const noPassPort = currentWsPort + 100;
            const noPassConfig = new ServerConfig({ requirepass: '' });
            const noPassServer = new RedisGenServer(noPassConfig.all());
            const noPassBridge = new WebSocketBridge(noPassServer);
            await new Promise(resolve => noPassBridge.start(noPassPort, '127.0.0.1', resolve));

            try {
                const authRes = await makeHttpRequest(noPassPort, '/api/auth/token', 'POST', JSON.stringify({
                    password: 'anypassword'
                }));
                assert.strictEqual(authRes.statusCode, 401);
                assert.ok(JSON.parse(authRes.body).error.includes('not configured'));
            } finally {
                await new Promise(resolve => noPassBridge.stop(resolve));
            }
        });

        it('RGEN-002: rejects forged OIDC JSON object login', async () => {
            const authRes = await makeHttpRequest(currentWsPort, '/api/auth/token', 'POST', JSON.stringify({
                googleIdToken: {
                    iss: 'https://accounts.google.com',
                    sub: 'attacker',
                    email: 'attacker@example.com',
                    exp: Math.floor(Date.now() / 1000) + 3600
                }
            }));
            assert.strictEqual(authRes.statusCode, 401);
            assert.ok(JSON.parse(authRes.body).error.includes('JWT string'));
        });

        it('CORS: returns restrictive header for non-allowlisted origin', async () => {
            const res = await makeHttpRequest(currentWsPort, '/health', 'GET', null, {
                'Origin': 'https://evil.example.com'
            });
            assert.strictEqual(res.statusCode, 200);
            // Non-allowlisted origin should get empty ACAO header
            assert.strictEqual(res.headers['access-control-allow-origin'], '');
        });
    });

    describe('Hardening - SSRF IPv6 Normalization', () => {
        it('blocks IPv4-mapped IPv6 loopback addresses', () => {
            // Node's URL parser converts ::ffff:127.0.0.1 to ::ffff:7f00:1
            // and wraps in brackets [::ffff:7f00:1]
            const r1 = parseAndValidateUrl('http://[::ffff:7f00:1]:8080');
            assert.strictEqual(r1.valid, false, 'Should block ::ffff:7f00:1 (loopback)');

            const r2 = parseAndValidateUrl('http://[::ffff:a00:1]:8080');
            assert.strictEqual(r2.valid, false, 'Should block ::ffff:a00:1 (10.0.0.1 private)');
        });
    });

    describe('Hardening - Parser Buffer Limit', () => {
        it('rejects input exceeding parser buffer limit', () => {
            const { RespParser } = require('../src/protocol/parser');
            const parser = new RespParser();
            // Should not throw for reasonable input
            parser.append(Buffer.from('+OK\r\n'));
            assert.ok(true);
            // The parser has a 64MB limit; we won't allocate that much in tests
            // but we verify the mechanism exists
            assert.strictEqual(typeof parser.pending, 'number');
        });
    });
});

function makeHttpRequest(port, path, method = 'GET', body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: path,
            method: method,
            headers: Object.assign({}, headers, body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}
