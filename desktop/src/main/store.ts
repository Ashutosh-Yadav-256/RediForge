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

  static encrypt(value: string): { data: string; isEncrypted: boolean } {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(value);
        return { data: encrypted.toString('base64'), isEncrypted: true };
      }
    } catch (err) {
      console.warn('[SecureStore] safeStorage encryption failed, falling back:', err);
    }

    return { data: Buffer.from(value, 'utf8').toString('base64'), isEncrypted: false };
  }

  static decrypt(data: string, isEncrypted: boolean): string {
    try {
      if (isEncrypted && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(data, 'base64');
        return safeStorage.decryptString(buffer);
      }
    } catch (err) {
      console.warn('[SecureStore] safeStorage decryption failed:', err);
    }

    return Buffer.from(data, 'base64').toString('utf8');
  }

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

  static deleteProfile(id: string): void {
    const list = store.get('connections', []);
    const filtered = list.filter(p => p.id !== id);
    store.set('connections', filtered);
  }

  static saveWindowState(state: WindowState): void {
    store.set('windowState', state);
  }

  static getWindowState(): WindowState {
    return store.get('windowState', {
      width: 1400,
      height: 900,
      isMaximized: false,
    });
  }
}
