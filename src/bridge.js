'use strict';

var http = require('http');
var crypto = require('crypto');
var url = require('url');
var fs = require('fs');
var path = require('path');
var registry = require('./commands/registry');
var encoder = require('./protocol/encoder');
var { RespParser } = require('./protocol/parser');
var { CommandGateway } = require('./security/command_gateway');
var { AuthService } = require('./security/auth_service');
var { AuditLogger } = require('./security/audit_logger');
var { parseAndValidateUrl, validateAndResolveUrl } = require('./utils/url_guard');

var WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
var MAX_WS_BUFFER = 16 * 1024 * 1024; // 16 MB max WebSocket buffer

// CORS allowlist: configured via CORS_ALLOWED_ORIGINS env var (comma-separated),
// defaults to common local dev origins.
var CORS_ALLOWED_ORIGINS = (function () {
    var envOrigins = process.env.CORS_ALLOWED_ORIGINS;
    if (envOrigins) {
        return new Set(envOrigins.split(',').map(function (o) { return o.trim(); }));
    }
    return new Set(['http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:8080']);
})();

function WebSocketBridge(redisServer, options = {}) {
    this._redis = redisServer;
    this._httpServer = null;
    this._clients = new Set();
    this._nextId = 1;
    this.authService = options.authService || new AuthService();
    this.auditLogger = options.auditLogger || new AuditLogger(1000);
    this.gateway = new CommandGateway(this._redis, {
        authService: this.authService,
        auditLogger: this.auditLogger,
        requireConfirmationForDangerous: options.requireConfirmationForDangerous
    });
}

WebSocketBridge.prototype.start = function (port, bind, callback) {
    var self = this;

    this._httpServer = http.createServer(function (req, res) {
        self._handleHttp(req, res);
    });

    this._httpServer.on('upgrade', function (req, socket, head) {
        self._handleUpgrade(req, socket, head);
    });

    this._httpServer.listen(port, bind || '0.0.0.0', function () {
        self._redis.log.info('Secure WebSocket bridge listening on port ' + port);
        if (callback) callback();
    });
};

WebSocketBridge.prototype.stop = function (callback) {
    for (var c of this._clients) {
        try { c.socket.destroy(); } catch (e) {}
    }
    this._clients.clear();

    if (this._httpServer) {
        this._httpServer.close(function () {
            if (callback) callback();
        });
        this._httpServer = null;
    } else if (callback) {
        callback();
    }
};

WebSocketBridge.prototype._readBody = function (req) {
    return new Promise(function (resolve, reject) {
        var body = '';
        req.on('data', function (chunk) {
            body += chunk;
            if (body.length > 1048576) { // 1MB limit
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', function () {
            resolve(body);
        });
        req.on('error', reject);
    });
};

WebSocketBridge.prototype._handleHttp = async function (req, res) {
    var origin = req.headers['origin'] || '';
    var parsedUrl = url.parse(req.url, true);
    var pathname = parsedUrl.pathname;

    // Only reflect origin if it is in the allowlist
    var allowedOrigin = CORS_ALLOWED_ORIGINS.has(origin) ? origin : '';
    var corsHeaders = {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Workspace-ID',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };

    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    if (pathname === '/health') {
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
        res.end(JSON.stringify({ status: 'ok', uptime: Math.floor(process.uptime()) }));
        return;
    }

    // Static frontend assets
    var staticFile = null;
    if (pathname === '/' || pathname === '/index.html') {
        staticFile = path.join(__dirname, '..', 'frontend', 'index.html');
    } else if (pathname === '/app.js') {
        staticFile = path.join(__dirname, '..', 'frontend', 'app.js');
    } else if (pathname === '/style.css') {
        staticFile = path.join(__dirname, '..', 'frontend', 'style.css');
    }

    if (staticFile && fs.existsSync(staticFile)) {
        var ext = path.extname(staticFile);
        var mime = ext === '.html' ? 'text/html; charset=utf-8' : (ext === '.js' ? 'application/javascript; charset=utf-8' : (ext === '.css' ? 'text/css; charset=utf-8' : 'text/plain'));
        var content = fs.readFileSync(staticFile);
        res.writeHead(200, Object.assign({ 'Content-Type': mime }, corsHeaders));
        res.end(content);
        return;
    }

    if (pathname === '/stats') {
        var mem = process.memoryUsage();
        var dbStats = [];
        for (var i = 0; i < this._redis.store.dbCount; i++) {
            var size = this._redis.store.dbSize(i);
            if (size > 0) dbStats.push({ db: i, keys: size });
        }

        var datasetMem = this._redis.store.usedMemory;
        var stats = {
            uptime_seconds: Math.floor(process.uptime()),
            connected_clients: this._redis.clientCount + this._clients.size,
            used_memory: datasetMem,
            used_memory_human: formatBytes(datasetMem),
            used_memory_rss: mem.rss,
            used_memory_heap: mem.heapUsed,
            total_keys: dbStats.reduce(function (s, d) { return s + d.keys; }, 0),
            databases: dbStats,
            node_version: process.version
        };

        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
        res.end(JSON.stringify(stats));
        return;
    }

    // SSRF-Protected /api/connect endpoint
    if (pathname === '/api/connect' && req.method === 'POST') {
        try {
            var rawBody = await this._readBody(req);
            var data = JSON.parse(rawBody || '{}');
            var targetUrl = data.url;

            if (!targetUrl) {
                res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
                res.end(JSON.stringify({ error: 'Missing target URL' }));
                return;
            }

            var validation = await validateAndResolveUrl(targetUrl, {
                allowPrivate: false // Block all internal targets / SSRF
            });

            if (!validation.valid) {
                res.writeHead(403, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
                res.end(JSON.stringify({ error: validation.error }));
                return;
            }

            res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
            res.end(JSON.stringify({
                status: 'valid',
                target: {
                    protocol: validation.protocol,
                    hostname: validation.hostname,
                    port: validation.port
                }
            }));
            return;
        } catch (err) {
            res.writeHead(500, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
            res.end(JSON.stringify({ error: err.message }));
            return;
        }
    }

    // Auth Token Exchange / Login
    if (pathname === '/api/auth/token' && req.method === 'POST') {
        try {
            var rawBody = await this._readBody(req);
            var body = JSON.parse(rawBody || '{}');

            if (body.googleIdToken) {
                // RGEN-002 FIX: Require compact JWT string, verify signature via Google JWKS
                if (typeof body.googleIdToken !== 'string') {
                    res.writeHead(401, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
                    res.end(JSON.stringify({ error: 'googleIdToken must be a JWT string' }));
                    return;
                }
                var oidcRes = await this.authService.verifyGoogleIdToken(body.googleIdToken);
                if (!oidcRes.valid) {
                    res.writeHead(401, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
                    res.end(JSON.stringify({ error: oidcRes.error }));
                    return;
                }
                var token = this.authService.createToken({
                    sub: oidcRes.user.id,
                    role: oidcRes.user.role,
                    email: oidcRes.user.email,
                    workspaces: Array.from(oidcRes.user.workspaces)
                });
                res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
                res.end(JSON.stringify({ token: token, user: oidcRes.user }));
                return;
            }

            if (body.password) {
                var requirePass = this._redis.config.get('requirepass');
                // RGEN-001 FIX: Reject login when requirepass is not configured
                if (!requirePass) {
                    res.writeHead(401, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
                    res.end(JSON.stringify({ error: 'Server password is not configured. Authentication cannot proceed.' }));
                    return;
                }
                if (body.password === requirePass) {
                    var role = 'admin';
                    var token = this.authService.createToken({
                        sub: body.username || 'default',
                        role: role,
                        workspaces: ['default-workspace']
                    });
                    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
                    res.end(JSON.stringify({ token: token, role: role }));
                    return;
                }
            }

            res.writeHead(401, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
            res.end(JSON.stringify({ error: 'Invalid credentials' }));
            return;
        } catch (e) {
            res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
            res.end(JSON.stringify({ error: 'Invalid request: ' + e.message }));
            return;
        }
    }

    // Admin Audit Logs
    if (pathname === '/api/admin/audit') {
        var authHeader = req.headers['authorization'];
        var token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        var verification = token ? this.authService.verifyToken(token) : { valid: false };

        if (!verification.valid || verification.payload.role !== 'admin') {
            res.writeHead(403, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
            res.end(JSON.stringify({ error: 'Admin authorization required' }));
            return;
        }

        var logs = this.auditLogger.query({
            limit: parseInt(parsedUrl.query.limit, 10) || 50
        });

        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, corsHeaders));
        res.end(JSON.stringify({ audit_logs: logs }));
        return;
    }

    res.writeHead(404, corsHeaders);
    res.end('Not Found');
};

WebSocketBridge.prototype._handleUpgrade = function (req, socket, head) {
    var key = req.headers['sec-websocket-key'];
    if (!key) {
        socket.destroy();
        return;
    }

    var parsedUrl = url.parse(req.url, true);
    var tokenFromQuery = parsedUrl.query.token;
    var requestedWorkspace = parsedUrl.query.workspace || 'default-workspace';
    var authInfo = {
        authenticated: false,
        userId: 'anonymous',
        role: 'viewer',
        workspaceId: requestedWorkspace
    };

    if (tokenFromQuery) {
        var verified = this.authService.verifyToken(tokenFromQuery);
        if (verified.valid) {
            authInfo.authenticated = true;
            authInfo.userId = verified.payload.sub || 'user';
            authInfo.role = verified.payload.role || 'developer';

            // RGEN-003 FIX: Validate workspace from token, not query string
            var tokenWorkspaces = verified.payload.workspaces || ['default-workspace'];
            if (tokenWorkspaces.indexOf(requestedWorkspace) === -1) {
                // Client requested a workspace not in their token — reject
                socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                socket.destroy();
                return;
            }
        }
    }

    // RGEN-001 FIX: Removed implicit no-password authentication fallback.
    // Anonymous clients remain unauthenticated regardless of requirepass setting.
    // They must authenticate via AUTH command or present a valid token.

    var accept = crypto.createHash('sha1')
        .update(key + WS_MAGIC)
        .digest('base64');

    var responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Accept: ' + accept
    ];

    socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

    var client = {
        id: this._nextId++,
        socket: socket,
        authenticated: authInfo.authenticated,
        userId: authInfo.userId,
        role: authInfo.role,
        workspaceId: authInfo.workspaceId,
        remoteAddr: (socket.remoteAddress || '127.0.0.1') + ':' + (socket.remotePort || 0),
        db: 0,
        txQueue: null,
        name: null,
        subscriptions: null,
        patternSubs: null,
        buffer: Buffer.alloc(0)
    };

    var self = this;

    client.write = function (data) {
        self._sendFrame(client.socket, data, 0x01);
    };

    client.destroy = function () {
        if (!client.socket.destroyed) {
            try { client.socket.destroy(); } catch (e) {}
        }
    };

    this._clients.add(client);
    this._redis.log.info('WS client connected (id=' + client.id + ', role=' + client.role + ')');

    socket.on('data', function (data) {
        self._onWsData(client, data);
    });

    socket.on('close', function () {
        self._clients.delete(client);
        if (self._redis.pubsub) {
            self._redis.pubsub.removeConnection(client);
        }
        self._redis.store.unwatchAll(client.id + 100000);
        self._redis.log.info('WS client disconnected (id=' + client.id + ')');
    });

    socket.on('error', function () {
        self._clients.delete(client);
        if (self._redis.pubsub) {
            self._redis.pubsub.removeConnection(client);
        }
    });
};

WebSocketBridge.prototype._onWsData = function (client, raw) {
    client.buffer = Buffer.concat([client.buffer, raw]);

    // Buffer overflow protection: close connections exceeding MAX_WS_BUFFER
    if (client.buffer.length > MAX_WS_BUFFER) {
        this._redis.log.warn('WS client buffer exceeded ' + MAX_WS_BUFFER + ' bytes, disconnecting (id=' + client.id + ')');
        client.socket.destroy();
        return;
    }

    while (client.buffer.length >= 2) {
        var frame = this._decodeFrame(client.buffer);
        if (!frame) break;

        client.buffer = client.buffer.slice(frame.totalLength);

        if (frame.opcode === 0x08) {
            client.socket.destroy();
            return;
        }

        if (frame.opcode === 0x09) {
            this._sendFrame(client.socket, frame.payload, 0x0A);
            continue;
        }

        if (frame.opcode === 0x01) {
            var text = frame.payload.toString('utf8');
            this._handleMessage(client, text);
        }
    }
};

WebSocketBridge.prototype._decodeFrame = function (buf) {
    if (buf.length < 2) return null;

    var firstByte = buf[0];
    var secondByte = buf[1];
    var opcode = firstByte & 0x0F;
    var masked = (secondByte & 0x80) !== 0;
    var payloadLength = secondByte & 0x7F;
    var offset = 2;

    if (payloadLength === 126) {
        if (buf.length < 4) return null;
        payloadLength = buf.readUInt16BE(2);
        offset = 4;
    } else if (payloadLength === 127) {
        if (buf.length < 10) return null;
        payloadLength = Number(buf.readBigUInt64BE(2));
        offset = 10;
    }

    var maskOffset = offset;
    if (masked) offset += 4;

    if (buf.length < offset + payloadLength) return null;

    var payload = buf.slice(offset, offset + payloadLength);

    if (masked) {
        var mask = buf.slice(maskOffset, maskOffset + 4);
        for (var i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i % 4];
        }
    }

    return {
        opcode: opcode,
        payload: payload,
        totalLength: offset + payloadLength
    };
};

WebSocketBridge.prototype._sendFrame = function (socket, data, opcode) {
    if (socket.destroyed) return;

    var payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    var frame;

    if (payload.length < 126) {
        frame = Buffer.alloc(2 + payload.length);
        frame[0] = 0x80 | (opcode || 0x01);
        frame[1] = payload.length;
        payload.copy(frame, 2);
    } else if (payload.length < 65536) {
        frame = Buffer.alloc(4 + payload.length);
        frame[0] = 0x80 | (opcode || 0x01);
        frame[1] = 126;
        frame.writeUInt16BE(payload.length, 2);
        payload.copy(frame, 4);
    } else {
        frame = Buffer.alloc(10 + payload.length);
        frame[0] = 0x80 | (opcode || 0x01);
        frame[1] = 127;
        frame.writeBigUInt64BE(BigInt(payload.length), 2);
        payload.copy(frame, 10);
    }

    socket.write(frame);
};

WebSocketBridge.prototype._handleMessage = function (client, text) {
    var msg;
    try {
        msg = JSON.parse(text);
    } catch (e) {
        this._sendJson(client, { error: 'invalid JSON' });
        return;
    }

    // Support token authentication message: { auth_token: "..." }
    if (msg.auth_token) {
        var verified = this.authService.verifyToken(msg.auth_token);
        if (verified.valid) {
            client.authenticated = true;
            client.userId = verified.payload.sub;
            client.role = verified.payload.role || 'developer';
            this._sendJson(client, { id: msg.id || null, status: 'AUTHENTICATED', role: client.role });
            return;
        } else {
            this._sendJson(client, { id: msg.id || null, error: 'Invalid token: ' + verified.error });
            return;
        }
    }

    if (!msg.command || !Array.isArray(msg.command) || msg.command.length === 0) {
        this._sendJson(client, { error: 'missing command array' });
        return;
    }

    var cmdParts = msg.command.map(function (p) { return String(p); });
    var cmdName = cmdParts[0].toLowerCase();

    // Confirmation flag for dangerous commands
    if (msg.confirmed) {
        client.confirmed = true;
    } else {
        client.confirmed = false;
    }

    // Execute via CommandGateway (Authentication -> Rate Limiting -> Workspace -> RBAC -> Dangerous Guard -> Redis Engine -> Audit Log)
    var execResult = this.gateway.execute(cmdParts, client);

    var response = execResult.response;
    var parsed = this._parseResp(response || '');

    if (cmdName === 'select' && response && response.indexOf('+OK') >= 0) {
        client.db = parseInt(cmdParts[1], 10) || 0;
    }

    if (cmdName === 'auth' && response && response.indexOf('+OK') >= 0) {
        client.authenticated = true;
        client.userId = 'admin-1';
        client.role = 'admin';
    }

    if (this._redis.aof && execResult.ctx) {
        var ctx = execResult.ctx;
        if (ctx.aofBuffer && ctx.aofBuffer.length > 0) {
            for (var j = 0; j < ctx.aofBuffer.length; j++) {
                this._redis.aof.appendCommand(ctx.aofBuffer[j]);
            }
        } else if (registry.isWriteCommand(cmdName)) {
            this._redis.aof.appendCommand(cmdParts);
        }
    }

    this._sendJson(client, {
        id: msg.id || null,
        status: execResult.status,
        result: parsed
    });
};

WebSocketBridge.prototype._parseResp = function (raw) {
    if (!raw || raw.length === 0) return null;
    try {
        var parser = new RespParser();
        parser.append(Buffer.from(raw, 'utf8'));
        var parsed = parser.parse();
        if (parsed.length === 0) return null;

        function formatVal(v) {
            if (v instanceof Error) return { error: v.message };
            if (Array.isArray(v)) return v.map(formatVal);
            return v;
        }

        return parsed.length === 1 ? formatVal(parsed[0]) : parsed.map(formatVal);
    } catch (e) {
        return raw;
    }
};

WebSocketBridge.prototype._sendJson = function (client, obj) {
    this._sendFrame(client.socket, JSON.stringify(obj), 0x01);
};

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + 'K';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + 'M';
    return (bytes / 1073741824).toFixed(2) + 'G';
}

module.exports = { WebSocketBridge: WebSocketBridge };
