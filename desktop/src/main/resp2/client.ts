/**
 * RESP2 TCP Client — Connects to a RediForge server over raw TCP,
 * sends RESP2-encoded commands, and parses responses.
 * 
 * Features:
 * - Promise-based sendCommand() with sequential request queue
 * - Auto-reconnect with exponential backoff
 * - AUTH on connect if password provided
 * - SELECT for database switching
 * - Event-driven lifecycle (connect, disconnect, error, ready)
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import { RespParser, RespValue } from './parser';
import { encodeCommandArray } from './encoder';

export interface Resp2ClientOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
  connectTimeout?: number;
  autoReconnect?: boolean;
  maxReconnectDelay?: number;
}

interface PendingRequest {
  resolve: (value: RespValue) => void;
  reject: (error: Error) => void;
  command: string[];
  timestamp: number;
}

export class Resp2Client extends EventEmitter {
  private _options: Required<Resp2ClientOptions>;
  private _socket: net.Socket | null = null;
  private _parser: RespParser;
  private _queue: PendingRequest[] = [];
  private _connected: boolean = false;
  private _ready: boolean = false;
  private _reconnectAttempts: number = 0;
  private _reconnectTimer: NodeJS.Timeout | null = null;
  private _destroyed: boolean = false;
  private _currentDb: number = 0;

  constructor(options: Resp2ClientOptions) {
    super();
    this._options = {
      host: options.host || '127.0.0.1',
      port: options.port || 6379,
      password: options.password || '',
      db: options.db || 0,
      connectTimeout: options.connectTimeout || 5000,
      autoReconnect: options.autoReconnect !== false,
      maxReconnectDelay: options.maxReconnectDelay || 30000,
    };
    this._parser = new RespParser();
  }

  get connected(): boolean { return this._connected; }
  get ready(): boolean { return this._ready; }
  get currentDb(): number { return this._currentDb; }

  /**
   * Connect to the RediForge server.
   */
  async connect(): Promise<void> {
    if (this._connected) return;

    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      this._socket = socket;

      const connectTimeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout after ${this._options.connectTimeout}ms`));
      }, this._options.connectTimeout);

      socket.connect(this._options.port, this._options.host, async () => {
        clearTimeout(connectTimeout);
        this._connected = true;
        this._reconnectAttempts = 0;
        this.emit('connect');

        try {
          // AUTH if password is set
          if (this._options.password) {
            const authResult = await this._sendRaw(['AUTH', this._options.password]);
            if (authResult instanceof Error) {
              throw new Error(`AUTH failed: ${authResult.message}`);
            }
          }

          // SELECT database if not default
          if (this._options.db && this._options.db > 0) {
            const selectResult = await this._sendRaw(['SELECT', String(this._options.db)]);
            if (selectResult instanceof Error) {
              throw new Error(`SELECT failed: ${selectResult.message}`);
            }
            this._currentDb = this._options.db;
          }

          this._ready = true;
          this.emit('ready');
          resolve();
        } catch (err) {
          this.disconnect();
          reject(err);
        }
      });

      socket.on('data', (data: Buffer) => {
        this._onData(data);
      });

      socket.on('error', (err: Error) => {
        clearTimeout(connectTimeout);
        this.emit('error', err);
        if (!this._connected) {
          reject(err);
        }
      });

      socket.on('close', () => {
        const wasConnected = this._connected;
        this._connected = false;
        this._ready = false;

        // Reject all pending requests
        for (const pending of this._queue) {
          pending.reject(new Error('Connection closed'));
        }
        this._queue = [];

        if (wasConnected) {
          this.emit('disconnect');
          if (this._options.autoReconnect && !this._destroyed) {
            this._scheduleReconnect();
          }
        }
      });

      socket.setNoDelay(true);
    });
  }

  /**
   * Disconnect from the server.
   */
  disconnect(): void {
    this._destroyed = true;
    this._ready = false;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._socket) {
      this._socket.removeAllListeners();
      if (!this._socket.destroyed) {
        this._socket.destroy();
      }
      this._socket = null;
    }

    this._connected = false;

    // Reject pending
    for (const pending of this._queue) {
      pending.reject(new Error('Client disconnected'));
    }
    this._queue = [];
    this._parser.reset();
  }

  /**
   * Send a command and get the response.
   */
  async sendCommand(cmd: string, ...args: string[]): Promise<RespValue> {
    return this._sendRaw([cmd, ...args]);
  }

  /**
   * Send a command from an array.
   */
  async sendCommandArray(parts: string[]): Promise<RespValue> {
    return this._sendRaw(parts);
  }

  /**
   * Switch to a different database.
   */
  async selectDb(index: number): Promise<void> {
    const result = await this.sendCommand('SELECT', String(index));
    if (result instanceof Error) {
      throw result;
    }
    this._currentDb = index;
  }

  /**
   * Internal: send raw command and wait for response.
   */
  private _sendRaw(parts: string[]): Promise<RespValue> {
    return new Promise<RespValue>((resolve, reject) => {
      if (!this._socket || this._socket.destroyed) {
        reject(new Error('Not connected'));
        return;
      }

      const request: PendingRequest = {
        resolve,
        reject,
        command: parts,
        timestamp: Date.now(),
      };

      this._queue.push(request);

      const encoded = encodeCommandArray(parts);
      this._socket.write(encoded);
    });
  }

  /**
   * Handle incoming data from the TCP socket.
   */
  private _onData(data: Buffer): void {
    try {
      this._parser.append(data);
      const results = this._parser.parse();

      for (const result of results) {
        const pending = this._queue.shift();
        if (pending) {
          pending.resolve(result);
        } else {
          // Unsolicited message (e.g., pub/sub)
          this.emit('message', result);
        }
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private _scheduleReconnect(): void {
    if (this._destroyed) return;

    this._reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(2, this._reconnectAttempts - 1),
      this._options.maxReconnectDelay
    );

    this.emit('reconnecting', { attempt: this._reconnectAttempts, delay });

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      if (this._destroyed) return;

      this._destroyed = false; // Reset for reconnect
      try {
        await this.connect();
      } catch {
        // Will trigger another reconnect via the close handler
      }
    }, delay);
  }
}
