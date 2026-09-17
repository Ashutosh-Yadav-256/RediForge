/**
 * Data IPC Handlers — Type-specific data operations for all 5 data structures.
 */

import { ipcMain } from 'electron';
import { ConnectionManager } from '../connection-manager';

export function registerDataHandlers(manager: ConnectionManager): void {
  // ─── String ───────────────────────────────
  ipcMain.handle('data:string:get', async (_event, key: string) => {
    return manager.execute('GET', key);
  });

  ipcMain.handle('data:string:set', async (_event, key: string, value: string) => {
    return manager.execute('SET', key, value);
  });

  // ─── List ─────────────────────────────────
  ipcMain.handle('data:list:range', async (_event, key: string, start: number, stop: number) => {
    return manager.execute('LRANGE', key, String(start), String(stop));
  });

  ipcMain.handle('data:list:len', async (_event, key: string) => {
    return manager.execute('LLEN', key);
  });

  ipcMain.handle('data:list:lpush', async (_event, key: string, ...values: string[]) => {
    return manager.execute('LPUSH', key, ...values);
  });

  ipcMain.handle('data:list:rpush', async (_event, key: string, ...values: string[]) => {
    return manager.execute('RPUSH', key, ...values);
  });

  ipcMain.handle('data:list:set', async (_event, key: string, index: number, value: string) => {
    return manager.execute('LSET', key, String(index), value);
  });

  ipcMain.handle('data:list:rem', async (_event, key: string, count: number, value: string) => {
    return manager.execute('LREM', key, String(count), value);
  });

  // ─── Hash ─────────────────────────────────
  ipcMain.handle('data:hash:getall', async (_event, key: string) => {
    const result = await manager.execute('HGETALL', key);
    // HGETALL returns flat [field, value, field, value, ...]
    if (Array.isArray(result)) {
      const obj: Record<string, string> = {};
      for (let i = 0; i < result.length; i += 2) {
        obj[String(result[i])] = String(result[i + 1]);
      }
      return obj;
    }
    return {};
  });

  ipcMain.handle('data:hash:set', async (_event, key: string, field: string, value: string) => {
    return manager.execute('HSET', key, field, value);
  });

  ipcMain.handle('data:hash:del', async (_event, key: string, ...fields: string[]) => {
    return manager.execute('HDEL', key, ...fields);
  });

  ipcMain.handle('data:hash:len', async (_event, key: string) => {
    return manager.execute('HLEN', key);
  });

  // ─── Set ──────────────────────────────────
  ipcMain.handle('data:set:members', async (_event, key: string) => {
    return manager.execute('SMEMBERS', key);
  });

  ipcMain.handle('data:set:add', async (_event, key: string, ...members: string[]) => {
    return manager.execute('SADD', key, ...members);
  });

  ipcMain.handle('data:set:rem', async (_event, key: string, ...members: string[]) => {
    return manager.execute('SREM', key, ...members);
  });

  ipcMain.handle('data:set:card', async (_event, key: string) => {
    return manager.execute('SCARD', key);
  });

  // ─── Sorted Set ───────────────────────────
  ipcMain.handle('data:zset:range', async (_event, key: string, start: number, stop: number, withScores: boolean) => {
    const args = ['ZRANGE', key, String(start), String(stop)];
    if (withScores) args.push('WITHSCORES');
    return manager.executeArray(args);
  });

  ipcMain.handle('data:zset:card', async (_event, key: string) => {
    return manager.execute('ZCARD', key);
  });

  ipcMain.handle('data:zset:add', async (_event, key: string, score: number, member: string) => {
    return manager.execute('ZADD', key, String(score), member);
  });

  ipcMain.handle('data:zset:rem', async (_event, key: string, ...members: string[]) => {
    return manager.execute('ZREM', key, ...members);
  });

  ipcMain.handle('data:zset:score', async (_event, key: string, member: string) => {
    return manager.execute('ZSCORE', key, member);
  });

  // ─── Generic key value fetch (auto-detects type) ──
  ipcMain.handle('data:get-value', async (_event, key: string, type: string) => {
    switch (type) {
      case 'string': return manager.execute('GET', key);
      case 'list': return manager.execute('LRANGE', key, '0', '-1');
      case 'hash': {
        const result = await manager.execute('HGETALL', key);
        if (Array.isArray(result)) {
          const obj: Record<string, string> = {};
          for (let i = 0; i < result.length; i += 2) {
            obj[String(result[i])] = String(result[i + 1]);
          }
          return obj;
        }
        return {};
      }
      case 'set': return manager.execute('SMEMBERS', key);
      case 'zset': return manager.execute('ZRANGE', key, '0', '-1', 'WITHSCORES');
      default: return null;
    }
  });
}
