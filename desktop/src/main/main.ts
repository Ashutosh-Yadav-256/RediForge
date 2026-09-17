/**
 * Electron Main Process Entry Point
 * 
 * Creates the application window, registers all IPC handlers,
 * and manages the app lifecycle.
 * 
 * Security: nodeIntegration disabled, contextIsolation enabled,
 * all server communication routed through main process.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { ConnectionManager } from './connection-manager';
import { SecureStore } from './store';
import { registerConnectionHandlers } from './ipc/connection';
import { registerKeysHandlers } from './ipc/keys';
import { registerDataHandlers } from './ipc/data';
import { registerConsoleHandlers } from './ipc/console';
import { registerMetricsHandlers } from './ipc/metrics';
import { registerPersistenceHandlers } from './ipc/persistence';
import { registerPubSubHandlers } from './ipc/pubsub';
import { registerTransactionHandlers } from './ipc/transaction';

let mainWindow: BrowserWindow | null = null;
const connectionManager = new ConnectionManager();

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): void {
  const savedState = SecureStore.getWindowState();

  mainWindow = new BrowserWindow({
    width: savedState.width || 1400,
    height: savedState.height || 900,
    x: savedState.x,
    y: savedState.y,
    minWidth: 1000,
    minHeight: 700,
    frame: false, // Frameless for custom title bar
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0e1a',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Needed for preload to use require
    },
    show: false,
  });

  // Graceful show after ready
  mainWindow.once('ready-to-show', () => {
    if (savedState.isMaximized) {
      mainWindow?.maximize();
    }
    mainWindow?.show();
  });

  const saveWindowState = () => {
    if (!mainWindow) return;
    const isMax = mainWindow.isMaximized();
    if (!isMax) {
      const bounds = mainWindow.getBounds();
      SecureStore.saveWindowState({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: false,
      });
    } else {
      const prev = SecureStore.getWindowState();
      SecureStore.saveWindowState({
        ...prev,
        isMaximized: true,
      });
    }
  };

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', saveWindowState);

  // Load the renderer
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Window Control IPC ─────────────────────
function registerWindowHandlers(): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('app:about', () => {
    return {
      name: 'RediForge Desktop Admin',
      version: '1.0.0',
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
    };
  });
}

// ─── App Lifecycle ──────────────────────────
app.whenReady().then(() => {
  // Register all IPC handlers
  registerWindowHandlers();
  registerConnectionHandlers(connectionManager, getMainWindow);
  registerKeysHandlers(connectionManager);
  registerDataHandlers(connectionManager);
  registerConsoleHandlers(connectionManager);
  registerMetricsHandlers(connectionManager, getMainWindow);
  registerPersistenceHandlers(connectionManager);
  registerPubSubHandlers(connectionManager, getMainWindow);
  registerTransactionHandlers(connectionManager);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  connectionManager.disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  connectionManager.disconnect();
});
