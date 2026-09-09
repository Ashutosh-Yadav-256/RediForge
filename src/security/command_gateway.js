'use strict';

const rbac = require('./rbac');
const { AuditLogger } = require('./audit_logger');
const { AuthService } = require('./auth_service');
const registry = require('../commands/registry');
const encoder = require('../protocol/encoder');

class RateLimiter {
    constructor(capacity = 100, refillRatePerSec = 50) {
        this.capacity = capacity;
        this.refillRate = refillRatePerSec;
        this.buckets = new Map(); // key -> { tokens, lastRefill }
    }

    consume(key, tokens = 1) {
        const now = Date.now();
        let bucket = this.buckets.get(key);

        if (!bucket) {
            bucket = { tokens: this.capacity, lastRefill: now };
            this.buckets.set(key, bucket);
        } else {
            const elapsed = (now - bucket.lastRefill) / 1000;
            bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillRate);
            bucket.lastRefill = now;
        }

        if (bucket.tokens >= tokens) {
            bucket.tokens -= tokens;
            return true;
        }

        return false;
    }

    reset() {
        this.buckets.clear();
    }
}

class CommandGateway {
    constructor(server, options = {}) {
        this.server = server;
        this.authService = options.authService || new AuthService();
        this.auditLogger = options.auditLogger || new AuditLogger(options.maxAuditEntries || 1000);
        this.rateLimiter = new RateLimiter(
            options.rateLimitCapacity || 150,
            options.rateLimitRefill || 100
        );
        this.requireConfirmationForDangerous = options.requireConfirmationForDangerous !== undefined
            ? options.requireConfirmationForDangerous
            : false;
    }

    execute(cmdParts, clientContext) {
        const startTime = Date.now();

        if (!Array.isArray(cmdParts) || cmdParts.length === 0) {
            return {
                status: 'ERROR',
                response: encoder.syntaxError()
            };
        }

        const cmdName = String(cmdParts[0]).toLowerCase();
        const args = cmdParts.slice(1).map(String);
        const remoteAddr = clientContext.remoteAddr || 'unknown';
        const clientKey = clientContext.userId || remoteAddr;

        // 1. Rate Limiting Check
        if (!this.rateLimiter.consume(clientKey, 1)) {
            this.auditLogger.log({
                userId: clientContext.userId,
                workspaceId: clientContext.workspaceId,
                remoteAddr: remoteAddr,
                command: cmdName,
                args: args,
                status: 'DENIED',
                reason: 'Rate limit exceeded',
                durationMs: Date.now() - startTime
            });
            return {
                status: 'RATE_LIMITED',
                response: encoder.encodeError('ERR Rate limit exceeded')
            };
        }

        // 2. Authentication Enforcement
        const requirePass = this.server && this.server.config ? this.server.config.get('requirepass') : null;
        const needsAuth = !!requirePass && !clientContext.authenticated;

        const isPreAuthAllowed = cmdName === 'auth' || cmdName === 'quit' || cmdName === 'hello';
        if (needsAuth && !isPreAuthAllowed) {
            this.auditLogger.log({
                userId: clientContext.userId,
                workspaceId: clientContext.workspaceId,
                remoteAddr: remoteAddr,
                command: cmdName,
                args: args,
                status: 'DENIED',
                reason: 'Authentication required',
                durationMs: Date.now() - startTime
            });
            return {
                status: 'UNAUTHENTICATED',
                response: encoder.encodeError('NOAUTH Authentication required.')
            };
        }

        // 3. Workspace Isolation Check (RGEN-003 FIX)
        if (clientContext.workspaceId && clientContext.userId && !isPreAuthAllowed) {
            const ws = this.authService.workspaces.get(clientContext.workspaceId);
            // Reject unknown workspace IDs explicitly — previously this fell through
            if (!ws) {
                this.auditLogger.log({
                    userId: clientContext.userId,
                    workspaceId: clientContext.workspaceId,
                    remoteAddr: remoteAddr,
                    command: cmdName,
                    args: args,
                    status: 'DENIED',
                    reason: 'Workspace not found',
                    durationMs: Date.now() - startTime
                });
                return {
                    status: 'WORKSPACE_DENIED',
                    response: encoder.encodeError('NOPERM Workspace not found: ' + clientContext.workspaceId)
                };
            }
            if (!ws.members.has(clientContext.userId)) {
                this.auditLogger.log({
                    userId: clientContext.userId,
                    workspaceId: clientContext.workspaceId,
                    remoteAddr: remoteAddr,
                    command: cmdName,
                    args: args,
                    status: 'DENIED',
                    reason: 'Access denied to workspace',
                    durationMs: Date.now() - startTime
                });
                return {
                    status: 'WORKSPACE_DENIED',
                    response: encoder.encodeError('NOPERM Access denied to workspace: ' + clientContext.workspaceId)
                };
            }
        }

        // 4. RBAC & Dangerous Command Protection
        if (!isPreAuthAllowed) {
            const userRole = clientContext.role || (clientContext.authenticated ? 'developer' : 'viewer');
            const requiredPerm = rbac.getRequiredPermission(cmdName);

            if (!rbac.hasPermission(userRole, requiredPerm)) {
                this.auditLogger.log({
                    userId: clientContext.userId,
                    workspaceId: clientContext.workspaceId,
                    remoteAddr: remoteAddr,
                    command: cmdName,
                    args: args,
                    status: 'DENIED',
                    reason: 'Insufficient permissions for role ' + userRole,
                    durationMs: Date.now() - startTime
                });
                return {
                    status: 'PERMISSION_DENIED',
                    response: encoder.encodeError(`NOPERM User role '${userRole}' lacks permission '${requiredPerm}' for command '${cmdName}'`)
                };
            }

            if (rbac.isDangerousCommand(cmdName)) {
                if (userRole !== 'admin') {
                    this.auditLogger.log({
                        userId: clientContext.userId,
                        workspaceId: clientContext.workspaceId,
                        remoteAddr: remoteAddr,
                        command: cmdName,
                        args: args,
                        status: 'DENIED',
                        reason: 'Dangerous command blocked for non-admin',
                        durationMs: Date.now() - startTime
                    });
                    return {
                        status: 'DANGEROUS_BLOCKED',
                        response: encoder.encodeError(`NOPERM Dangerous command '${cmdName.toUpperCase()}' is restricted to admin role`)
                    };
                }

                if (this.requireConfirmationForDangerous && !clientContext.confirmed) {
                    return {
                        status: 'CONFIRMATION_REQUIRED',
                        response: encoder.encodeError(`ERR Dangerous command '${cmdName.toUpperCase()}' requires confirmation flag`)
                    };
                }
            }
        }

        // 5. Execute Command via Registry
        const ctx = {
            db: clientContext.db !== undefined ? clientContext.db : 0,
            store: this.server.store,
            config: this.server.config,
            connection: clientContext,
            pubsub: this.server.pubsub,
            clientCount: this.server.clientCount,
            aofBuffer: null
        };

        const response = registry.dispatch(cmdParts, ctx);

        if (cmdName === 'auth' && response && response.indexOf('+OK') >= 0) {
            clientContext.authenticated = true;
            clientContext.role = 'admin';
        }

        const durationMs = Date.now() - startTime;
        this.auditLogger.log({
            userId: clientContext.userId,
            workspaceId: clientContext.workspaceId,
            remoteAddr: remoteAddr,
            command: cmdName,
            args: args,
            status: 'ALLOWED',
            durationMs: durationMs
        });

        return {
            status: 'OK',
            response: response,
            ctx: ctx
        };
    }
}

module.exports = { CommandGateway, RateLimiter };
