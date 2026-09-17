import { ipcMain } from 'electron';
import { ConnectionManager } from '../connection-manager';
import { RespValue } from '../resp2/parser';

export function registerKeysHandlers(manager: ConnectionManager): void {
  ipcMain.handle('keys:scan', async (_event, cursor: number, match: string, count: number) => {
    const result = await manager.execute(
      'SCAN', String(cursor), 'MATCH', match || '*', 'COUNT', String(count || 100)
    );

    if (Array.isArray(result) && result.length === 2) {
      return {
        cursor: parseInt(String(result[0]), 10),
        keys: Array.isArray(result[1]) ? result[1] as string[] : [],
      };
    }
    return { cursor: 0, keys: [] };
  });

  ipcMain.handle('keys:type', async (_event, key: string) => {
    return manager.execute('TYPE', key);
  });

  ipcMain.handle('keys:ttl', async (_event, key: string) => {
    return manager.execute('TTL', key);
  });

  ipcMain.handle('keys:pttl', async (_event, key: string) => {
    return manager.execute('PTTL', key);
  });

  ipcMain.handle('keys:delete', async (_event, keys: string[]) => {
    return manager.execute('DEL', ...keys);
  });

  ipcMain.handle('keys:rename', async (_event, from: string, to: string) => {
    return manager.execute('RENAME', from, to);
  });

  ipcMain.handle('keys:expire', async (_event, key: string, seconds: number) => {
    return manager.execute('EXPIRE', key, String(seconds));
  });

  ipcMain.handle('keys:persist', async (_event, key: string) => {
    return manager.execute('PERSIST', key);
  });

  ipcMain.handle('keys:exists', async (_event, key: string) => {
    return manager.execute('EXISTS', key);
  });
}
