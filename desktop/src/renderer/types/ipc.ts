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

export interface ConnectResult {
  success: boolean;
  error?: string;
}

export interface ScanResult {
  cursor: number;
  keys: string[];
}

export interface ConsoleResult {
  output: string;
  error: string | null;
}

export interface ServerInfo {
  server: Record<string, string>;
  clients: Record<string, string>;
  memory: Record<string, string>;
  stats: Record<string, string>;
  keyspace: Record<string, { keys: number; expires: number }>;
}

export interface MetricsUpdate {
  timestamp: number;
  info: ServerInfo;
}

declare global {
  interface Window {
    api: {

      connect(profile: ConnectionProfile): Promise<ConnectResult>;
      disconnect(): Promise<void>;
      getConnectionStatus(): Promise<ConnectionStatus>;
      saveConnection(profile: ConnectionProfile): Promise<any>;
      deleteConnection(id: string): Promise<any>;
      getSavedConnections(): Promise<ConnectionProfile[]>;
      onConnectionStatusChanged(callback: (status: ConnectionStatus) => void): void;

      scanKeys(cursor: number, match: string, count: number): Promise<ScanResult>;
      getKeyType(key: string): Promise<string>;
      getKeyTTL(key: string): Promise<number>;
      deleteKeys(keys: string[]): Promise<number>;
      renameKey(from: string, to: string): Promise<void>;
      setKeyTTL(key: string, seconds: number): Promise<void>;
      persistKey(key: string): Promise<void>;

      getKeyValue(key: string, type: string): Promise<any>;
      stringGet(key: string): Promise<string | null>;
      stringSet(key: string, value: string): Promise<any>;
      listRange(key: string, start: number, stop: number): Promise<string[]>;
      listLen(key: string): Promise<number>;
      listLpush(key: string, ...values: string[]): Promise<number>;
      listRpush(key: string, ...values: string[]): Promise<number>;
      hashGetAll(key: string): Promise<Record<string, string>>;
      hashSet(key: string, field: string, value: string): Promise<any>;
      hashDel(key: string, ...fields: string[]): Promise<number>;
      setMembers(key: string): Promise<string[]>;
      setAdd(key: string, ...members: string[]): Promise<number>;
      setRem(key: string, ...members: string[]): Promise<number>;
      zsetRange(key: string, start: number, stop: number, withScores: boolean): Promise<string[]>;
      zsetAdd(key: string, score: number, member: string): Promise<number>;
      zsetRem(key: string, ...members: string[]): Promise<number>;

      executeCommand(commandStr: string, safeMode: boolean): Promise<ConsoleResult>;
      getCommandList(): Promise<string[]>;

      getServerInfo(): Promise<ServerInfo | null>;
      getDbSize(db?: number): Promise<number>;
      startMetricsPolling(intervalMs: number): Promise<any>;
      stopMetricsPolling(): Promise<any>;
      onMetricsUpdate(callback: (data: MetricsUpdate) => void): void;

      triggerSave(): Promise<any>;
      configGet(key: string): Promise<any>;
      configGetAll(): Promise<Record<string, string>>;
      configSet(key: string, value: string): Promise<any>;
      selectDb(index: number): Promise<any>;
      swapDb(a: number, b: number): Promise<any>;

      subscribe(channel: string): Promise<any>;
      unsubscribe(channel: string): Promise<any>;
      publish(channel: string, message: string): Promise<any>;
      onPubSubMessage(callback: (msg: any) => void): void;

      txMulti(): Promise<any>;
      txExec(): Promise<any>;
      txDiscard(): Promise<any>;
      txWatch(keys: string[]): Promise<any>;
      txUnwatch(): Promise<any>;
      txQueueCommand(parts: string[]): Promise<any>;

      minimizeWindow(): Promise<void>;
      maximizeWindow(): Promise<void>;
      closeWindow(): Promise<void>;
      getAppInfo(): Promise<AppInfo>;
    };
  }
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  node: string;
  chrome: string;
  platform: string;
  arch: string;
}
