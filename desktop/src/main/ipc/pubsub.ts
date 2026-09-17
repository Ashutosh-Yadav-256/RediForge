import { ipcMain, BrowserWindow } from 'electron';
import { ConnectionManager } from '../connection-manager';
import { Resp2Client } from '../resp2/client';
import { RespValue } from '../resp2/parser';

let pubsubClient: Resp2Client | null = null;

export function registerPubSubHandlers(
  manager: ConnectionManager,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle('pubsub:subscribe', async (_event, channel: string) => {
    try {

      const status = manager.getStatus();
      if (!status.connected || !status.host || !status.port) {
        return { success: false, error: 'Not connected' };
      }

      if (!pubsubClient) {
        pubsubClient = new Resp2Client({
          host: status.host,
          port: status.port,
          autoReconnect: false,
        });

        pubsubClient.on('message', (msg: RespValue) => {

          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('pubsub:message', {
              timestamp: Date.now(),
              data: msg,
            });
          }
        });

        await pubsubClient.connect();
      }

      await pubsubClient.sendCommand('SUBSCRIBE', channel);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('pubsub:unsubscribe', async (_event, channel: string) => {
    try {
      if (pubsubClient) {
        await pubsubClient.sendCommand('UNSUBSCRIBE', channel);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('pubsub:publish', async (_event, channel: string, message: string) => {
    try {

      const result = await manager.execute('PUBLISH', channel, message);
      return { success: true, receivers: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('pubsub:disconnect', async () => {
    if (pubsubClient) {
      pubsubClient.disconnect();
      pubsubClient = null;
    }
    return { success: true };
  });
}
