/**
 * Console IPC Handlers — Free-form command execution.
 */

import { ipcMain } from 'electron';
import { ConnectionManager } from '../connection-manager';
import { RespValue } from '../resp2/parser';

/** All 93 commands from the RediForge registry, for autocomplete */
const COMMAND_LIST = [
  'SET', 'GET', 'MGET', 'MSET', 'SETNX', 'GETDEL', 'INCR', 'DECR',
  'INCRBY', 'DECRBY', 'INCRBYFLOAT', 'APPEND', 'STRLEN', 'GETRANGE',
  'DEL', 'UNLINK', 'EXISTS', 'KEYS', 'TYPE', 'EXPIRE', 'PEXPIRE',
  'EXPIREAT', 'PEXPIREAT', 'TTL', 'PTTL', 'PERSIST', 'RENAME',
  'RENAMENX', 'RANDOMKEY', 'SCAN', 'OBJECT',
  'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LLEN', 'LRANGE', 'LINDEX',
  'LSET', 'LREM', 'LPOS',
  'HSET', 'HGET', 'HDEL', 'HGETALL', 'HMSET', 'HMGET', 'HEXISTS',
  'HLEN', 'HKEYS', 'HVALS', 'HINCRBY', 'HINCRBYFLOAT', 'HSETNX',
  'SADD', 'SREM', 'SMEMBERS', 'SISMEMBER', 'SMISMEMBER', 'SCARD',
  'SUNION', 'SINTER', 'SDIFF', 'SRANDMEMBER', 'SPOP',
  'ZADD', 'ZREM', 'ZSCORE', 'ZRANK', 'ZREVRANK', 'ZRANGE',
  'ZREVRANGE', 'ZRANGEBYSCORE', 'ZCARD', 'ZCOUNT', 'ZINCRBY',
  'PING', 'ECHO', 'DBSIZE', 'FLUSHDB', 'FLUSHALL', 'SELECT',
  'SWAPDB', 'TIME', 'INFO', 'COMMAND', 'CONFIG', 'CLIENT',
  'QUIT', 'RESET', 'HELLO',
  'SUBSCRIBE', 'UNSUBSCRIBE', 'PSUBSCRIBE', 'PUNSUBSCRIBE', 'PUBLISH',
  'MULTI', 'EXEC', 'DISCARD', 'WATCH', 'UNWATCH',
  'AUTH',
];

/** Commands that modify data — blocked in safe mode */
const WRITE_COMMANDS = new Set([
  'SET', 'SETNX', 'GETDEL', 'INCR', 'DECR', 'INCRBY', 'DECRBY',
  'INCRBYFLOAT', 'APPEND', 'MSET',
  'DEL', 'UNLINK', 'EXPIRE', 'PEXPIRE', 'EXPIREAT', 'PEXPIREAT',
  'PERSIST', 'RENAME', 'RENAMENX',
  'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LSET', 'LREM',
  'HSET', 'HDEL', 'HMSET', 'HINCRBY', 'HINCRBYFLOAT', 'HSETNX',
  'SADD', 'SREM', 'SPOP',
  'ZADD', 'ZREM', 'ZINCRBY',
  'FLUSHDB', 'FLUSHALL', 'SWAPDB',
]);

/**
 * Parse a raw command string into parts, handling quoted strings.
 */
function parseCommandString(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else if (ch === '\\' && i + 1 < input.length) {
        i++;
        current += input[i];
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

/**
 * Format a RESP value into a human-readable string for the console.
 */
function formatRespValue(value: RespValue, indent: number = 0): string {
  const prefix = '  '.repeat(indent);

  if (value === null) {
    return prefix + '(nil)';
  }
  if (value instanceof Error) {
    return prefix + '(error) ' + value.message;
  }
  if (typeof value === 'number') {
    return prefix + '(integer) ' + value;
  }
  if (typeof value === 'string') {
    return prefix + '"' + value + '"';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return prefix + '(empty array)';
    }
    const lines = value.map((item, i) => {
      return prefix + (i + 1) + ') ' + formatRespValue(item, 0);
    });
    return lines.join('\n');
  }
  return prefix + String(value);
}

export function registerConsoleHandlers(manager: ConnectionManager): void {
  ipcMain.handle('console:execute', async (_event, commandStr: string, safeMode: boolean) => {
    const parts = parseCommandString(commandStr);
    if (parts.length === 0) {
      return { output: '', error: null };
    }

    const cmd = parts[0].toUpperCase();

    // Safe mode check
    if (safeMode && WRITE_COMMANDS.has(cmd)) {
      return {
        output: '',
        error: `Safe mode is ON — "${cmd}" is a write command and is blocked. Disable safe mode to execute.`,
      };
    }

    try {
      const result = await manager.executeArray(parts);
      return {
        output: formatRespValue(result),
        error: null,
      };
    } catch (err: any) {
      return {
        output: '',
        error: err.message,
      };
    }
  });

  ipcMain.handle('console:command-list', async () => {
    return COMMAND_LIST;
  });

  ipcMain.handle('console:is-write-command', async (_event, cmd: string) => {
    return WRITE_COMMANDS.has(cmd.toUpperCase());
  });
}
