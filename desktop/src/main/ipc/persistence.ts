import { ipcMain } from 'electron';
import { ConnectionManager } from '../connection-manager';

export function registerPersistenceHandlers(manager: ConnectionManager): void {
  ipcMain.handle('persist:save', async () => {
    try {

      const result = await manager.execute('PING');

      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('persist:config-get', async (_event, key: string) => {
    try {
      const result = await manager.execute('CONFIG', 'GET', key);
      if (Array.isArray(result) && result.length >= 2) {
        return { key: String(result[0]), value: String(result[1]) };
      }
      return null;
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('persist:config-get-all', async () => {
    try {
      const result = await manager.execute('CONFIG', 'GET', '*');
      if (Array.isArray(result)) {
        const config: Record<string, string> = {};
        for (let i = 0; i < result.length; i += 2) {
          config[String(result[i])] = String(result[i + 1]);
        }
        return config;
      }
      return {};
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('persist:config-set', async (_event, key: string, value: string) => {
    try {
      const result = await manager.execute('CONFIG', 'SET', key, value);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('persist:select-db', async (_event, index: number) => {
    try {
      await manager.selectDb(index);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('persist:swapdb', async (_event, a: number, b: number) => {
    try {
      const result = await manager.execute('SWAPDB', String(a), String(b));
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
