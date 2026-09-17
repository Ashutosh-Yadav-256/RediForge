/**
 * Connection IPC Handlers — Connect, disconnect, auth, status.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { ConnectionManager, ConnectionProfile } from '../connection-manager';

export function registerConnectionHandlers(
  manager: ConnectionManager,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle('conn:connect', async (_event, profile: ConnectionProfile) => {
    return manager.connect(profile);
  });

  ipcMain.handle('conn:disconnect', async () => {
    manager.disconnect();
    return { success: true };
  });

  ipcMain.handle('conn:status', async () => {
    return manager.getStatus();
  });

  ipcMain.handle('conn:save-profile', async (_event, profile: ConnectionProfile) => {
    manager.saveProfile(profile);
    return { success: true };
  });

  ipcMain.handle('conn:delete-profile', async (_event, id: string) => {
    manager.deleteProfile(id);
    return { success: true };
  });

  ipcMain.handle('conn:get-profiles', async () => {
    return manager.getProfiles();
  });

  // Push status changes to renderer
  manager.onStatusChange((status) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('conn:status-changed', status);
    }
  });
}
