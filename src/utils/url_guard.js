'use strict';

const dns = require('dns').promises;
const net = require('net');

const ALLOWED_SCHEMES = new Set(['redis:', 'rediss:', 'ws:', 'wss:', 'http:', 'https:']);

function isPrivateIp(ip) {
    if (!ip) return false;

    // Strip brackets from URL-parsed IPv6 addresses (e.g. [::1] -> ::1)
    if (ip.startsWith('[') && ip.endsWith(']')) {
        ip = ip.slice(1, -1);
    }

    // IPv4
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4) return true;

        // 127.0.0.0/8 (loopback)
        if (parts[0] === 127) return true;
        // 0.0.0.0/8 (current network)
        if (parts[0] === 0) return true;
        // 10.0.0.0/8 (private)
        if (parts[0] === 10) return true;
        // 172.16.0.0/12 (private)
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        // 192.168.0.0/16 (private)
        if (parts[0] === 192 && parts[1] === 168) return true;
        // 169.254.0.0/16 (link-local, cloud metadata)
        if (parts[0] === 169 && parts[1] === 254) return true;
        // 100.64.0.0/10 (carrier-grade NAT)
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
        // 255.255.255.255 (broadcast)
        if (parts[0] === 255 && parts[1] === 255 && parts[2] === 255 && parts[3] === 255) return true;

        return false;
    }

    // IPv6
    if (net.isIPv6(ip)) {
        const normalized = ip.toLowerCase();
        // ::1 (loopback)
        if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
        // :: (unspecified)
        if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
        // fe80::/10 (link-local)
        if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
        // fc00::/7 (unique local address)
        if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

        // IPv4-mapped IPv6 normalization (::ffff:x.x.x.x and variants)
        // Handles: ::ffff:127.0.0.1, 0:0:0:0:0:ffff:127.0.0.1,
        //          ::ffff:7f00:1, 0:0:0:0:0:ffff:7f00:1
        const ffffMatch = normalized.match(/^(?:0:){0,4}0{0,4}:?:?ffff:(.+)$/);
        if (ffffMatch) {
            const mapped = ffffMatch[1];
            // Dotted-quad form (e.g. 127.0.0.1)
            if (net.isIPv4(mapped)) {
                return isPrivateIp(mapped);
            }
            // Hex form (e.g. 7f00:0001 -> 127.0.0.1)
            const hexParts = mapped.split(':');
            if (hexParts.length === 2) {
                const hi = parseInt(hexParts[0], 16);
                const lo = parseInt(hexParts[1], 16);
                if (!isNaN(hi) && !isNaN(lo)) {
                    const ipv4 = ((hi >> 8) & 0xff) + '.' + (hi & 0xff) + '.' + ((lo >> 8) & 0xff) + '.' + (lo & 0xff);
                    return isPrivateIp(ipv4);
                }
            }
        }

        return false;
    }

    return false;
}

function isDangerousHostname(hostname) {
    if (!hostname) return true;
    const lower = hostname.toLowerCase().trim();
    if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
    if (lower === 'metadata.google.internal' || lower === 'instance-data') return true;
    if (lower.endsWith('.local') || lower.endsWith('.internal')) return true;
    return false;
}

function parseAndValidateUrl(rawUrl, options) {
    const opts = options || {};
    const allowPrivate = opts.allowPrivate !== undefined ? opts.allowPrivate : false;
    const allowedSchemes = opts.allowedSchemes || ALLOWED_SCHEMES;

    if (!rawUrl || typeof rawUrl !== 'string') {
        return { valid: false, error: 'Invalid URL string' };
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (e) {
        return { valid: false, error: 'Malformed URL: ' + e.message };
    }

    if (!allowedSchemes.has(parsed.protocol)) {
        return { valid: false, error: 'Unsupported scheme: ' + parsed.protocol };
    }

    const hostname = parsed.hostname;
    if (!hostname || hostname.length === 0 || hostname.length > 253) {
        return { valid: false, error: 'Invalid hostname' };
    }

    let port = parsed.port ? parseInt(parsed.port, 10) : null;
    if (port !== null) {
        if (isNaN(port) || port <= 0 || port > 65535) {
            return { valid: false, error: 'Port out of range' };
        }
    } else {
        if (parsed.protocol === 'redis:') port = 6379;
        else if (parsed.protocol === 'rediss:') port = 6380;
        else if (parsed.protocol === 'http:' || parsed.protocol === 'ws:') port = 80;
        else if (parsed.protocol === 'https:' || parsed.protocol === 'wss:') port = 443;
    }

    if (!allowPrivate) {
        if (isDangerousHostname(hostname) || isPrivateIp(hostname)) {
            return { valid: false, error: 'Target host is in a blocked private or internal network' };
        }
    }

    return {
        valid: true,
        protocol: parsed.protocol,
        hostname: hostname,
        port: port,
        pathname: parsed.pathname,
        username: parsed.username || null,
        password: parsed.password || null,
        url: parsed.href
    };
}

async function validateAndResolveUrl(rawUrl, options) {
    const check = parseAndValidateUrl(rawUrl, options);
    if (!check.valid) return check;

    const opts = options || {};
    const allowPrivate = opts.allowPrivate !== undefined ? opts.allowPrivate : false;

    if (allowPrivate) {
        return check;
    }

    // Resolve DNS to verify actual destination IP
    try {
        const addresses = await dns.lookup(check.hostname, { all: true });
        for (const addr of addresses) {
            if (isPrivateIp(addr.address)) {
                return {
                    valid: false,
                    error: `Resolved target IP (${addr.address}) belongs to a forbidden private network`
                };
            }
        }
    } catch (err) {
        return {
            valid: false,
            error: 'DNS resolution failed for ' + check.hostname + ': ' + err.message
        };
    }

    return check;
}

module.exports = {
    isPrivateIp,
    isDangerousHostname,
    parseAndValidateUrl,
    validateAndResolveUrl,
    ALLOWED_SCHEMES
};
