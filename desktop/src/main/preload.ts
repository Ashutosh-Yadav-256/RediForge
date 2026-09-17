/**
 * Preload Script — Exposes a typed, sandboxed API to the renderer via contextBridge.
 * This is the ONLY surface area between the UI and Node.js.
 * nodeIntegration: false, contextIsolation: true.
 */

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // ─── Connection ─────────────────────────────
  connect: (profile: any) => ipcRenderer.invoke('conn:connect', profile),
  disconnect: () => ipcRenderer.invoke('conn:disconnect'),
  getConnectionStatus: () => ipcRenderer.invoke('conn:status'),
  saveConnection: (profile: any) => ipcRenderer.invoke('conn:save-profile', profile),
  deleteConnection: (id: string) => ipcRenderer.invoke('conn:delete-profile', id),
  getSavedConnections: () => ipcRenderer.invoke('conn:get-profiles'),
  onConnectionStatusChanged: (callback: (status: any) => void) => {
    ipcRenderer.on('conn:status-changed', (_event, status) => callback(status));
  },

  // ─── Key Browser ────────────────────────────
  scanKeys: (cursor: number, match: string, count: number) =>
    ipcRenderer.invoke('keys:scan', cursor, match, count),
  getKeyType: (key: string) => ipcRenderer.invoke('keys:type', key),
  getKeyTTL: (key: string) => ipcRenderer.invoke('keys:ttl', key),
  deleteKeys: (keys: string[]) => ipcRenderer.invoke('keys:delete', keys),
  renameKey: (from: string, to: string) => ipcRenderer.invoke('keys:rename', from, to),
  setKeyTTL: (key: string, seconds: number) => ipcRenderer.invoke('keys:expire', key, seconds),
  persistKey: (key: string) => ipcRenderer.invoke('keys:persist', key),

  // ─── Data (type-specific) ───────────────────
  getKeyValue: (key: string, type: string) => ipcRenderer.invoke('data:get-value', key, type),
  stringGet: (key: string) => ipcRenderer.invoke('data:string:get', key),
  stringSet: (key: string, value: string) => ipcRenderer.invoke('data:string:set', key, value),
  listRange: (key: string, start: number, stop: number) =>
    ipcRenderer.invoke('data:list:range', key, start, stop),
  listLen: (key: string) => ipcRenderer.invoke('data:list:len', key),
  listLpush: (key: string, ...values: string[]) => ipcRenderer.invoke('data:list:lpush', key, ...values),
  listRpush: (key: string, ...values: string[]) => ipcRenderer.invoke('data:list:rpush', key, ...values),
  hashGetAll: (key: string) => ipcRenderer.invoke('data:hash:getall', key),
  hashSet: (key: string, field: string, value: string) =>
    ipcRenderer.invoke('data:hash:set', key, field, value),
  hashDel: (key: string, ...fields: string[]) => ipcRenderer.invoke('data:hash:del', key, ...fields),
  setMembers: (key: string) => ipcRenderer.invoke('data:set:members', key),
  setAdd: (key: string, ...members: string[]) => ipcRenderer.invoke('data:set:add', key, ...members),
  setRem: (key: string, ...members: string[]) => ipcRenderer.invoke('data:set:rem', key, ...members),
  zsetRange: (key: string, start: number, stop: number, withScores: boolean) =>
    ipcRenderer.invoke('data:zset:range', key, start, stop, withScores),
  zsetAdd: (key: string, score: number, member: string) =>
    ipcRenderer.invoke('data:zset:add', key, score, member),
  zsetRem: (key: string, ...members: string[]) => ipcRenderer.invoke('data:zset:rem', key, ...members),

  // ─── Console ────────────────────────────────
  executeCommand: (commandStr: string, safeMode: boolean) =>
    ipcRenderer.invoke('console:execute', commandStr, safeMode),
  getCommandList: () => ipcRenderer.invoke('console:command-list'),

  // ─── Metrics ────────────────────────────────
  getServerInfo: () => ipcRenderer.invoke('metrics:info'),
  getDbSize: (db?: number) => ipcRenderer.invoke('metrics:dbsize', db),
  startMetricsPolling: (intervalMs: number) => ipcRenderer.invoke('metrics:start-polling', intervalMs),
  stopMetricsPolling: () => ipcRenderer.invoke('metrics:stop-polling'),
  onMetricsUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('metrics:update', (_event, data) => callback(data));
  },

  // ─── Persistence & Config ───────────────────
  triggerSave: () => ipcRenderer.invoke('persist:save'),
  configGet: (key: string) => ipcRenderer.invoke('persist:config-get', key),
  configGetAll: () => ipcRenderer.invoke('persist:config-get-all'),
  configSet: (key: string, value: string) => ipcRenderer.invoke('persist:config-set', key, value),
  selectDb: (index: number) => ipcRenderer.invoke('persist:select-db', index),
  swapDb: (a: number, b: number) => ipcRenderer.invoke('persist:swapdb', a, b),

  // ─── Pub/Sub ────────────────────────────────
  subscribe: (channel: string) => ipcRenderer.invoke('pubsub:subscribe', channel),
  unsubscribe: (channel: string) => ipcRenderer.invoke('pubsub:unsubscribe', channel),
  publish: (channel: string, message: string) => ipcRenderer.invoke('pubsub:publish', channel, message),
  onPubSubMessage: (callback: (msg: any) => void) => {
    ipcRenderer.on('pubsub:message', (_event, msg) => callback(msg));
  },

  // ─── Transactions ──────────────────────────
  txMulti: () => ipcRenderer.invoke('tx:multi'),
  txExec: () => ipcRenderer.invoke('tx:exec'),
  txDiscard: () => ipcRenderer.invoke('tx:discard'),
  txWatch: (keys: string[]) => ipcRenderer.invoke('tx:watch', keys),
  txUnwatch: () => ipcRenderer.invoke('tx:unwatch'),
  txQueueCommand: (parts: string[]) => ipcRenderer.invoke('tx:queue-command', parts),

  // ─── Window Controls & App Info ─────────────
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  getAppInfo: () => ipcRenderer.invoke('app:about'),
};

contextBridge.exposeInMainWorld('api', api);

export type ApiType = typeof api;
