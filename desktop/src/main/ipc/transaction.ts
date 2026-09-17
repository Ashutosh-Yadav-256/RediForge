import { ipcMain } from 'electron';
import { ConnectionManager } from '../connection-manager';

export function registerTransactionHandlers(manager: ConnectionManager): void {
  ipcMain.handle('tx:multi', async () => {
    try {
      const result = await manager.execute('MULTI');
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tx:exec', async () => {
    try {
      const result = await manager.execute('EXEC');
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tx:discard', async () => {
    try {
      const result = await manager.execute('DISCARD');
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tx:watch', async (_event, keys: string[]) => {
    try {
      const result = await manager.execute('WATCH', ...keys);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tx:unwatch', async () => {
    try {
      const result = await manager.execute('UNWATCH');
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tx:queue-command', async (_event, parts: string[]) => {
    try {

      const result = await manager.executeArray(parts);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
