/**
 * Connection Manager — Manages multiple named RESP2 connections.
 * Persists connection profiles, tracks active connection,
 * and provides the bridge between IPC handlers and the RESP2 client.
 */

import { Resp2Client, Resp2ClientOptions } from './resp2/client';
import { RespValue } from './resp2/parser';
import { SecureStore } from './store';

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  password?: string;
  db?: number;
  color?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  ready: boolean;
  profileId: string | null;
  profileName: string | null;
  host: string | null;
  port: number | null;
  currentDb: number;
}

export class ConnectionManager {
  private _client: Resp2Client | null = null;
  private _activeProfile: ConnectionProfile | null = null;
  private _profiles: Map<string, ConnectionProfile> = new Map();
  private _statusListeners: Array<(status: ConnectionStatus) => void> = [];
  private _messageListeners: Array<(msg: RespValue) => void> = [];

  constructor() {
    try {
      const stored = SecureStore.getProfiles();
      for (const p of stored) {
        this._profiles.set(p.id, p);
      }
    } catch (err) {
      console.warn('[ConnectionManager] Failed to load stored profiles:', err);
    }
  }

  /**
   * Connect to a RediForge server using the given profile.
   */
  async connect(profile: ConnectionProfile): Promise<{ success: boolean; error?: string }> {
    // Disconnect existing connection
    if (this._client) {
      this.disconnect();
    }

    const options: Resp2ClientOptions = {
      host: profile.host,
      port: profile.port,
      password: profile.password,
      db: profile.db || 0,
      autoReconnect: true,
    };

    this._client = new Resp2Client(options);
    this._activeProfile = profile;

    // Wire up events
    this._client.on('connect', () => {
      this._notifyStatus();
    });

    this._client.on('ready', () => {
      this._notifyStatus();
    });

    this._client.on('disconnect', () => {
      this._notifyStatus();
    });

    this._client.on('error', (err: Error) => {
      console.error('[ConnectionManager] Error:', err.message);
    });

    this._client.on('message', (msg: RespValue) => {
      for (const listener of this._messageListeners) {
        listener(msg);
      }
    });

    this._client.on('reconnecting', (info: { attempt: number; delay: number }) => {
      console.log(`[ConnectionManager] Reconnecting (attempt ${info.attempt}, delay ${info.delay}ms)`);
    });

    try {
      await this._client.connect();
      return { success: true };
    } catch (err: any) {
      this._client = null;
      this._activeProfile = null;
      return { success: false, error: err.message };
    }
  }

  /**
   * Disconnect the active connection.
   */
  disconnect(): void {
    if (this._client) {
      this._client.disconnect();
      this._client = null;
    }
    this._activeProfile = null;
    this._notifyStatus();
  }

  /**
   * Execute a command on the active connection.
   */
  async execute(cmd: string, ...args: string[]): Promise<RespValue> {
    if (!this._client || !this._client.ready) {
      throw new Error('Not connected');
    }
    return this._client.sendCommand(cmd, ...args);
  }

  /**
   * Execute a command from an array.
   */
  async executeArray(parts: string[]): Promise<RespValue> {
    if (!this._client || !this._client.ready) {
      throw new Error('Not connected');
    }
    return this._client.sendCommandArray(parts);
  }

  /**
   * Switch to a different database.
   */
  async selectDb(index: number): Promise<void> {
    if (!this._client || !this._client.ready) {
      throw new Error('Not connected');
    }
    await this._client.selectDb(index);
  }

  /**
   * Get the current connection status.
   */
  getStatus(): ConnectionStatus {
    return {
      connected: this._client?.connected || false,
      ready: this._client?.ready || false,
      profileId: this._activeProfile?.id || null,
      profileName: this._activeProfile?.name || null,
      host: this._activeProfile?.host || null,
      port: this._activeProfile?.port || null,
      currentDb: this._client?.currentDb || 0,
    };
  }

  /**
   * Register a status change listener.
   */
  onStatusChange(listener: (status: ConnectionStatus) => void): void {
    this._statusListeners.push(listener);
  }

  /**
   * Register an unsolicited message listener (for pub/sub).
   */
  onMessage(listener: (msg: RespValue) => void): void {
    this._messageListeners.push(listener);
  }

  /**
   * Connection profile management.
   */
  saveProfile(profile: ConnectionProfile): void {
    this._profiles.set(profile.id, profile);
    try {
      SecureStore.saveProfile(profile);
    } catch (err) {
      console.warn('[ConnectionManager] Failed to persist profile:', err);
    }
  }

  deleteProfile(id: string): void {
    this._profiles.delete(id);
    try {
      SecureStore.deleteProfile(id);
    } catch (err) {
      console.warn('[ConnectionManager] Failed to delete stored profile:', err);
    }
  }

  getProfiles(): ConnectionProfile[] {
    return Array.from(this._profiles.values());
  }

  getProfile(id: string): ConnectionProfile | undefined {
    return this._profiles.get(id);
  }

  private _notifyStatus(): void {
    const status = this.getStatus();
    for (const listener of this._statusListeners) {
      listener(status);
    }
  }
}
