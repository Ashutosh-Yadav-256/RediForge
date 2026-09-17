import { ipcMain, BrowserWindow } from 'electron';
import { ConnectionManager } from '../connection-manager';

interface ParsedInfo {
  server: Record<string, string>;
  clients: Record<string, string>;
  memory: Record<string, string>;
  stats: Record<string, string>;
  keyspace: Record<string, { keys: number; expires: number }>;
}

function parseInfoResponse(raw: string): ParsedInfo {
  const info: ParsedInfo = {
    server: {},
    clients: {},
    memory: {},
    stats: {},
    keyspace: {},
  };

  let currentSection = '';
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('# ')) {
      currentSection = trimmed.slice(2).toLowerCase();
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;

    const key = trimmed.slice(0, colonIdx);
    const value = trimmed.slice(colonIdx + 1);

    if (currentSection === 'keyspace') {

      const match = value.match(/keys=(\d+),expires=(\d+)/);
      if (match) {
        info.keyspace[key] = {
          keys: parseInt(match[1], 10),
          expires: parseInt(match[2], 10),
        };
      }
    } else if (currentSection in info) {
      (info as any)[currentSection][key] = value;
    }
  }

  return info;
}

let metricsInterval: NodeJS.Timeout | null = null;

export function registerMetricsHandlers(
  manager: ConnectionManager,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle('metrics:info', async () => {
    try {
      const result = await manager.execute('INFO');
      if (typeof result === 'string') {
        return parseInfoResponse(result);
      }
      return null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('metrics:dbsize', async (_event, db?: number) => {
    try {
      if (db !== undefined) {
        await manager.selectDb(db);
      }
      return manager.execute('DBSIZE');
    } catch {
      return 0;
    }
  });

  ipcMain.handle('metrics:start-polling', async (_event, intervalMs: number) => {
    if (metricsInterval) {
      clearInterval(metricsInterval);
    }

    metricsInterval = setInterval(async () => {
      try {
        const result = await manager.execute('INFO');
        if (typeof result === 'string') {
          const parsed = parseInfoResponse(result);
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('metrics:update', {
              timestamp: Date.now(),
              info: parsed,
            });
          }
        }
      } catch {

        if (metricsInterval) {
          clearInterval(metricsInterval);
          metricsInterval = null;
        }
      }
    }, intervalMs || 2000);

    return { success: true };
  });

  ipcMain.handle('metrics:stop-polling', async () => {
    if (metricsInterval) {
      clearInterval(metricsInterval);
      metricsInterval = null;
    }
    return { success: true };
  });
}
