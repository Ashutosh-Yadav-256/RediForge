'use strict';

const crypto = require('crypto');
const https = require('https');

const DEFAULT_SECRET = process.env.REDISGEN_AUTH_SECRET || 'redisgen_zero_cost_secret_' + crypto.randomBytes(16).toString('hex');
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_JWKS_CACHE_TTL_MS = 3600000; // 1 hour

function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
}

function base64UrlDecodeBuffer(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64');
}

function signHmac(content, secret) {
    return crypto.createHmac('sha256', secret)
        .update(content)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

// Convert a JWK RSA key to a PEM public key for signature verification
function jwkToPem(jwk) {
    const n = base64UrlDecodeBuffer(jwk.n);
    const e = base64UrlDecodeBuffer(jwk.e);

    // DER encode the RSA public key
    function encodeLengthDer(length) {
        if (length < 0x80) return Buffer.from([length]);
        if (length < 0x100) return Buffer.from([0x81, length]);
        return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
    }

    function encodeUnsignedInteger(buf) {
        // Prepend 0x00 if high bit is set (to keep the integer positive)
        const needsPad = buf[0] & 0x80;
        const intBody = needsPad ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
        return Buffer.concat([Buffer.from([0x02]), encodeLengthDer(intBody.length), intBody]);
    }

    const encodedN = encodeUnsignedInteger(n);
    const encodedE = encodeUnsignedInteger(e);
    const sequenceBody = Buffer.concat([encodedN, encodedE]);
    const rsaSequence = Buffer.concat([Buffer.from([0x30]), encodeLengthDer(sequenceBody.length), sequenceBody]);

    // Wrap in BIT STRING
    const bitString = Buffer.concat([Buffer.from([0x03]), encodeLengthDer(rsaSequence.length + 1), Buffer.from([0x00]), rsaSequence]);

    // RSA OID: 1.2.840.113549.1.1.1
    const rsaOid = Buffer.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);

    const spkiBody = Buffer.concat([rsaOid, bitString]);
    const spki = Buffer.concat([Buffer.from([0x30]), encodeLengthDer(spkiBody.length), spkiBody]);

    const base64 = spki.toString('base64');
    const lines = base64.match(/.{1,64}/g) || [];
    return '-----BEGIN PUBLIC KEY-----\n' + lines.join('\n') + '\n-----END PUBLIC KEY-----\n';
}

// Fetch JSON over HTTPS (returns a Promise)
function httpsGetJson(uri) {
    return new Promise((resolve, reject) => {
        const req = https.get(uri, { timeout: 10000 }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error('JWKS fetch failed with status ' + res.statusCode));
                res.resume();
                return;
            }
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error('Invalid JSON from JWKS endpoint'));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('JWKS fetch timed out')); });
    });
}

class AuthService {
    constructor(secret, options = {}) {
        this.secret = secret || DEFAULT_SECRET;
        this.googleClientId = options.googleClientId || GOOGLE_OAUTH_CLIENT_ID;
        this.users = new Map(); // userId -> { id, email, name, role, workspaces: Set }
        this.workspaces = new Map(); // workspaceId -> { id, name, ownerId, members: Map<userId, role> }
        this.sessions = new Map(); // token -> { userId, workspaceId, expiresAt }
        this._jwksCache = null;
        this._jwksCacheTime = 0;
        this._initDefaultAdmin();
    }

    _initDefaultAdmin() {
        const defaultAdmin = {
            id: 'admin-1',
            email: 'admin@redisgen.local',
            name: 'Default Admin',
            role: 'admin',
            workspaces: new Set(['default-workspace'])
        };
        this.users.set(defaultAdmin.id, defaultAdmin);

        this.workspaces.set('default-workspace', {
            id: 'default-workspace',
            name: 'Default Workspace',
            ownerId: defaultAdmin.id,
            members: new Map([[defaultAdmin.id, 'admin']])
        });
    }

    createToken(payload, expiresInSeconds = 3600) {
        const header = { alg: 'HS256', typ: 'JWT' };
        const now = Math.floor(Date.now() / 1000);
        const fullPayload = Object.assign({}, payload, {
            iat: now,
            exp: now + expiresInSeconds
        });

        const encodedHeader = base64UrlEncode(JSON.stringify(header));
        const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
        const signature = signHmac(`${encodedHeader}.${encodedPayload}`, this.secret);

        return `${encodedHeader}.${encodedPayload}.${signature}`;
    }

    verifyToken(token) {
        if (!token || typeof token !== 'string') {
            return { valid: false, error: 'Token missing or invalid' };
        }

        const parts = token.split('.');
        if (parts.length !== 3) {
            return { valid: false, error: 'Invalid token structure' };
        }

        const [headerB64, payloadB64, signature] = parts;
        const expectedSig = signHmac(`${headerB64}.${payloadB64}`, this.secret);

        if (signature.length !== expectedSig.length ||
            !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
            return { valid: false, error: 'Invalid token signature' };
        }

        let payload;
        try {
            payload = JSON.parse(base64UrlDecode(payloadB64));
        } catch (e) {
            return { valid: false, error: 'Malformed token payload' };
        }

        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return { valid: false, error: 'Token has expired' };
        }

        return { valid: true, payload };
    }

    registerUser(user) {
        if (!user || !user.id) throw new Error('User ID required');
        const userData = {
            id: user.id,
            email: user.email || `${user.id}@redisgen.local`,
            name: user.name || user.id,
            role: user.role || 'developer',
            workspaces: new Set(user.workspaces || ['default-workspace'])
        };
        this.users.set(userData.id, userData);

        for (const wsId of userData.workspaces) {
            if (!this.workspaces.has(wsId)) {
                this.createWorkspace(wsId, `${wsId} Workspace`, userData.id);
            } else {
                this.workspaces.get(wsId).members.set(userData.id, userData.role);
            }
        }
        return userData;
    }

    createWorkspace(workspaceId, name, ownerId) {
        const ws = {
            id: workspaceId,
            name: name || workspaceId,
            ownerId: ownerId,
            members: new Map([[ownerId, 'admin']])
        };
        this.workspaces.set(workspaceId, ws);
        return ws;
    }

    /**
     * Fetch Google's JWKS (JSON Web Key Set) with caching.
     */
    async _getGoogleJwks() {
        const now = Date.now();
        if (this._jwksCache && (now - this._jwksCacheTime) < GOOGLE_JWKS_CACHE_TTL_MS) {
            return this._jwksCache;
        }
        const jwks = await httpsGetJson(GOOGLE_JWKS_URI);
        if (!jwks || !Array.isArray(jwks.keys)) {
            throw new Error('Invalid JWKS response from Google');
        }
        this._jwksCache = jwks;
        this._jwksCacheTime = now;
        return jwks;
    }

    /**
     * Verify a Google ID token (compact JWT string) with full cryptographic
     * signature verification, issuer, audience, expiry, and subject checks.
     *
     * @param {string} tokenString - The compact JWT string (header.payload.signature)
     * @param {string} [expectedAudience] - Override audience; defaults to this.googleClientId
     * @returns {Promise<{valid: boolean, error?: string, user?: object}>}
     */
    async verifyGoogleIdToken(tokenString, expectedAudience) {
        // 1. Require OIDC to be configured
        const audience = expectedAudience || this.googleClientId;
        if (!audience) {
            return { valid: false, error: 'OIDC login is not configured. Set GOOGLE_OAUTH_CLIENT_ID.' };
        }

        // 2. Token must be a compact JWT string, not a decoded object
        if (!tokenString || typeof tokenString !== 'string') {
            return { valid: false, error: 'ID token must be a JWT string, not a decoded object' };
        }

        const parts = tokenString.split('.');
        if (parts.length !== 3) {
            return { valid: false, error: 'Invalid ID token structure' };
        }

        const [headerB64, payloadB64, signatureB64] = parts;

        // 3. Decode header and payload
        let header, payload;
        try {
            header = JSON.parse(base64UrlDecode(headerB64));
        } catch (e) {
            return { valid: false, error: 'Malformed ID token header' };
        }

        try {
            payload = JSON.parse(base64UrlDecode(payloadB64));
        } catch (e) {
            return { valid: false, error: 'Malformed ID token payload' };
        }

        // 4. Check algorithm
        if (header.alg !== 'RS256') {
            return { valid: false, error: 'Unsupported algorithm: ' + header.alg + '. Expected RS256.' };
        }

        // 5. Validate claims before signature (fast reject)
        const iss = payload.iss;
        if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
            return { valid: false, error: 'Invalid token issuer: ' + iss };
        }

        if (payload.aud !== audience) {
            return { valid: false, error: 'Invalid token audience' };
        }

        const now = Math.floor(Date.now() / 1000);
        if (!payload.exp || payload.exp < now) {
            return { valid: false, error: 'ID token has expired' };
        }

        if (!payload.sub) {
            return { valid: false, error: 'ID token missing subject claim' };
        }

        // 6. Fetch JWKS and find the signing key
        let jwks;
        try {
            jwks = await this._getGoogleJwks();
        } catch (e) {
            return { valid: false, error: 'Failed to fetch Google signing keys: ' + e.message };
        }

        const kid = header.kid;
        const jwk = kid
            ? jwks.keys.find(k => k.kid === kid)
            : jwks.keys[0]; // fallback if no kid in header

        if (!jwk) {
            return { valid: false, error: 'No matching signing key found for kid: ' + kid };
        }

        // 7. Verify RS256 signature
        let pem;
        try {
            pem = jwkToPem(jwk);
        } catch (e) {
            return { valid: false, error: 'Failed to convert signing key: ' + e.message };
        }

        const signedContent = headerB64 + '.' + payloadB64;
        const signatureBuffer = base64UrlDecodeBuffer(signatureB64);

        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(signedContent);

        let signatureValid;
        try {
            signatureValid = verifier.verify(pem, signatureBuffer);
        } catch (e) {
            return { valid: false, error: 'Signature verification error: ' + e.message };
        }

        if (!signatureValid) {
            return { valid: false, error: 'Invalid ID token signature' };
        }

        // 8. Signature valid — register or retrieve user
        const userId = 'google_' + payload.sub;
        let user = this.users.get(userId);
        if (!user) {
            user = this.registerUser({
                id: userId,
                email: payload.email,
                name: payload.name || payload.email,
                role: 'developer',
                workspaces: ['default-workspace']
            });
        }

        return { valid: true, user };
    }

    /**
     * @deprecated Use verifyGoogleIdToken instead. This method is retained
     * only for backward compatibility and always rejects.
     */
    verifyOidcPayload(_oidcPayload, _expectedAudience) {
        return { valid: false, error: 'Raw OIDC payload verification is disabled. Use verifyGoogleIdToken with a JWT string.' };
    }
}

module.exports = {
    AuthService,
    base64UrlEncode,
    base64UrlDecode,
    base64UrlDecodeBuffer,
    jwkToPem,
    httpsGetJson
};
