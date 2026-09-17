/**
 * Local Settings & Encrypted Profile Storage
 * 
 * Uses electron-store for persisting settings and connection profiles.
 * Uses Electron's native safeStorage (DPAPI on Windows / Keychain on macOS)
 * to encrypt passwords before writing to disk.
 */

import Store from 'electron-store';
import { safeStorage } from 'electron';
import type { ConnectionProfile } from './connection-manager';

interface StoredProfile extends Omit<ConnectionProfile, 'password'> {
  encryptedPassword?: string;
  isEncrypted?: boolean;
}

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

interface AppSchema {
  connections: StoredProfile[];
  windowState: WindowState;
  activeProfileId?: string;
}

const store = new Store<AppSchema>({
  name: 'rediforge-config',
  defaults: {
    connections: [
      {
        id: 'default-local',
        name: 'Local RediForge',
        host: '127.0.0.1',
        port: 6379,
        db: 0,
        color: '#dc2626',
      },
    ],
    windowState: {
      width: 1400,
      height: 900,
      isMaximized: false,
    },
  },
});

export class SecureStore {
  /**
   * Encrypt a sensitive string (e.g. password) using native OS encryption.
   */
  static encrypt(value: string): { data: string; isEncrypted: boolean } {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(value);
        return { data: encrypted.toString('base64'), isEncrypted: true };
      }
    } catch (err) {
      console.warn('[SecureStore] safeStorage encryption failed, falling back:', err);
    }
    // Fallback if safeStorage is not available in current environment
    return { data: Buffer.from(value, 'utf8').toString('base64'), isEncrypted: false };
  }

  /**
   * Decrypt a sensitive string.
   */
  static decrypt(data: string, isEncrypted: boolean): string {
    try {
      if (isEncrypted && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(data, 'base64');
        return safeStorage.decryptString(buffer);
      }
    } catch (err) {
      console.warn('[SecureStore] safeStorage decryption failed:', err);
    }
    // Fallback decoding
    return Buffer.from(data, 'base64').toString('utf8');
  }

  /**
   * Save or update a connection profile.
   */
  static saveProfile(profile: ConnectionProfile): void {
    const list = store.get('connections', []);
    const stored: StoredProfile = {
      id: profile.id,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      db: profile.db,
      color: profile.color,
    };

    if (profile.password) {
      const { data, isEncrypted } = this.encrypt(profile.password);
      stored.encryptedPassword = data;
      stored.isEncrypted = isEncrypted;
    }

    const idx = list.findIndex(p => p.id === profile.id);
    if (idx >= 0) {
      list[idx] = stored;
    } else {
      list.push(stored);
    }

    store.set('connections', list);
  }

  /**
   * Load all saved connection profiles with decrypted passwords.
   */
  static getProfiles(): ConnectionProfile[] {
    const stored = store.get('connections', []);
    return stored.map(s => {
      let password: string | undefined;
      if (s.encryptedPassword) {
        password = this.decrypt(s.encryptedPassword, !!s.isEncrypted);
      }
      return {
        id: s.id,
        name: s.name,
        host: s.host,
        port: s.port,
        password,
        db: s.db,
        color: s.color,
      };
    });
  }

  /**
   * Delete a saved profile by ID.
   */
  static deleteProfile(id: string): void {
    const list = store.get('connections', []);
    const filtered = list.filter(p => p.id !== id);
    store.set('connections', filtered);
  }

  /**
   * Save window state across launches.
   */
  static saveWindowState(state: WindowState): void {
    store.set('windowState', state);
  }

  /**
   * Retrieve stored window state.
   */
  static getWindowState(): WindowState {
    return store.get('windowState', {
      width: 1400,
      height: 900,
      isMaximized: false,
    });
  }
}
