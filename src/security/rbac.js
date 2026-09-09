'use strict';

const PERMISSIONS = {
    KEY_READ: 'key.read',
    KEY_WRITE: 'key.write',
    METRICS_READ: 'metrics.read',
    COMMAND_EXECUTE: 'command.execute',
    CONNECTION_MANAGE: 'connection.manage',
    SYSTEM_ADMIN: 'system.admin',
    ALL: '*'
};

const ROLES = {
    viewer: new Set([PERMISSIONS.KEY_READ, PERMISSIONS.METRICS_READ]),
    developer: new Set([PERMISSIONS.KEY_READ, PERMISSIONS.KEY_WRITE, PERMISSIONS.COMMAND_EXECUTE, PERMISSIONS.METRICS_READ]),
    operator: new Set([PERMISSIONS.KEY_READ, PERMISSIONS.KEY_WRITE, PERMISSIONS.COMMAND_EXECUTE, PERMISSIONS.METRICS_READ, PERMISSIONS.CONNECTION_MANAGE]),
    admin: new Set([PERMISSIONS.ALL])
};

const DANGEROUS_COMMANDS = new Set([
    'flushall',
    'flushdb',
    'shutdown',
    'config',
    'keys',
    'debug',
    'slaveof',
    'replicaof',
    'save',
    'bgsave',
    'bgrewriteaof'
]);

const COMMAND_PERMISSIONS = {
    // String Read
    get: PERMISSIONS.KEY_READ,
    mget: PERMISSIONS.KEY_READ,
    strlen: PERMISSIONS.KEY_READ,
    getrange: PERMISSIONS.KEY_READ,
    exists: PERMISSIONS.KEY_READ,
    type: PERMISSIONS.KEY_READ,
    ttl: PERMISSIONS.KEY_READ,
    pttl: PERMISSIONS.KEY_READ,

    // String Write
    set: PERMISSIONS.KEY_WRITE,
    setnx: PERMISSIONS.KEY_WRITE,
    getdel: PERMISSIONS.KEY_WRITE,
    incr: PERMISSIONS.KEY_WRITE,
    decr: PERMISSIONS.KEY_WRITE,
    incrby: PERMISSIONS.KEY_WRITE,
    decrby: PERMISSIONS.KEY_WRITE,
    incrbyfloat: PERMISSIONS.KEY_WRITE,
    append: PERMISSIONS.KEY_WRITE,
    mset: PERMISSIONS.KEY_WRITE,
    del: PERMISSIONS.KEY_WRITE,
    unlink: PERMISSIONS.KEY_WRITE,
    expire: PERMISSIONS.KEY_WRITE,
    pexpire: PERMISSIONS.KEY_WRITE,
    expireat: PERMISSIONS.KEY_WRITE,
    pexpireat: PERMISSIONS.KEY_WRITE,
    persist: PERMISSIONS.KEY_WRITE,
    rename: PERMISSIONS.KEY_WRITE,
    renamenx: PERMISSIONS.KEY_WRITE,

    // Hash Read
    hget: PERMISSIONS.KEY_READ,
    hmget: PERMISSIONS.KEY_READ,
    hgetall: PERMISSIONS.KEY_READ,
    hexists: PERMISSIONS.KEY_READ,
    hlen: PERMISSIONS.KEY_READ,
    hkeys: PERMISSIONS.KEY_READ,
    hvals: PERMISSIONS.KEY_READ,

    // Hash Write
    hset: PERMISSIONS.KEY_WRITE,
    hmset: PERMISSIONS.KEY_WRITE,
    hdel: PERMISSIONS.KEY_WRITE,
    hincrby: PERMISSIONS.KEY_WRITE,
    hincrbyfloat: PERMISSIONS.KEY_WRITE,
    hsetnx: PERMISSIONS.KEY_WRITE,

    // List Read
    lrange: PERMISSIONS.KEY_READ,
    llen: PERMISSIONS.KEY_READ,
    lindex: PERMISSIONS.KEY_READ,

    // List Write
    lpush: PERMISSIONS.KEY_WRITE,
    rpush: PERMISSIONS.KEY_WRITE,
    lpop: PERMISSIONS.KEY_WRITE,
    rpop: PERMISSIONS.KEY_WRITE,
    lrem: PERMISSIONS.KEY_WRITE,
    lset: PERMISSIONS.KEY_WRITE,
    ltrim: PERMISSIONS.KEY_WRITE,

    // Set Read
    smembers: PERMISSIONS.KEY_READ,
    sismember: PERMISSIONS.KEY_READ,
    scard: PERMISSIONS.KEY_READ,
    srandmember: PERMISSIONS.KEY_READ,

    // Set Write
    sadd: PERMISSIONS.KEY_WRITE,
    srem: PERMISSIONS.KEY_WRITE,
    spop: PERMISSIONS.KEY_WRITE,
    smove: PERMISSIONS.KEY_WRITE,
    sunion: PERMISSIONS.KEY_READ,
    sinter: PERMISSIONS.KEY_READ,
    sdiff: PERMISSIONS.KEY_READ,
    sunionstore: PERMISSIONS.KEY_WRITE,
    sinterstore: PERMISSIONS.KEY_WRITE,
    sdiffstore: PERMISSIONS.KEY_WRITE,

    // Sorted Set Read
    zrange: PERMISSIONS.KEY_READ,
    zrevrange: PERMISSIONS.KEY_READ,
    zrank: PERMISSIONS.KEY_READ,
    zrevrank: PERMISSIONS.KEY_READ,
    zscore: PERMISSIONS.KEY_READ,
    zcard: PERMISSIONS.KEY_READ,
    zcount: PERMISSIONS.KEY_READ,

    // Sorted Set Write
    zadd: PERMISSIONS.KEY_WRITE,
    zrem: PERMISSIONS.KEY_WRITE,
    zincrby: PERMISSIONS.KEY_WRITE,
    zremrangebyrank: PERMISSIONS.KEY_WRITE,
    zremrangebyscore: PERMISSIONS.KEY_WRITE,

    // Metrics / General
    ping: PERMISSIONS.METRICS_READ,
    echo: PERMISSIONS.METRICS_READ,
    time: PERMISSIONS.METRICS_READ,
    info: PERMISSIONS.METRICS_READ,
    dbsize: PERMISSIONS.METRICS_READ,
    command: PERMISSIONS.METRICS_READ,
    randomkey: PERMISSIONS.KEY_READ,
    select: PERMISSIONS.COMMAND_EXECUTE,

    // Connection
    client: PERMISSIONS.CONNECTION_MANAGE,
    swapdb: PERMISSIONS.CONNECTION_MANAGE,

    // Admin & Dangerous
    flushdb: PERMISSIONS.SYSTEM_ADMIN,
    flushall: PERMISSIONS.SYSTEM_ADMIN,
    config: PERMISSIONS.SYSTEM_ADMIN,
    keys: PERMISSIONS.SYSTEM_ADMIN,
    save: PERMISSIONS.SYSTEM_ADMIN,
    bgsave: PERMISSIONS.SYSTEM_ADMIN,
    bgrewriteaof: PERMISSIONS.SYSTEM_ADMIN,
    shutdown: PERMISSIONS.SYSTEM_ADMIN,
    debug: PERMISSIONS.SYSTEM_ADMIN
};

function hasPermission(roleName, permission) {
    const rolePermissions = ROLES[roleName];
    if (!rolePermissions) return false;
    if (rolePermissions.has(PERMISSIONS.ALL)) return true;
    return rolePermissions.has(permission);
}

function isDangerousCommand(cmdName) {
    if (!cmdName) return false;
    return DANGEROUS_COMMANDS.has(cmdName.toLowerCase());
}

function getRequiredPermission(cmdName) {
    if (!cmdName) return PERMISSIONS.COMMAND_EXECUTE;
    const lower = cmdName.toLowerCase();
    return COMMAND_PERMISSIONS[lower] || PERMISSIONS.COMMAND_EXECUTE;
}

module.exports = {
    PERMISSIONS,
    ROLES,
    DANGEROUS_COMMANDS,
    hasPermission,
    isDangerousCommand,
    getRequiredPermission
};
