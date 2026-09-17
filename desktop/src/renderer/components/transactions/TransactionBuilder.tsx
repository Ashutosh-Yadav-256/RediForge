import React, { useState } from 'react';

interface QueuedCommand {
  id: number;
  parts: string[];
  status: 'queued' | 'executed' | 'error';
}

export const TransactionBuilder: React.FC = () => {
  const [inTransaction, setInTransaction] = useState(false);
  const [queue, setQueue] = useState<QueuedCommand[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [watchInput, setWatchInput] = useState('');
  const [watchedKeys, setWatchedKeys] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const nextId = React.useRef(0);

  const handleMulti = async () => {
    setError(null);
    setResult(null);
    const res = await window.api.txMulti();
    if (res.success) {
      setInTransaction(true);
      setQueue([]);
    } else {
      setError(res.error);
    }
  };

  const handleExec = async () => {
    setError(null);
    const res = await window.api.txExec();
    if (res.success) {
      setResult(res.result);
      setInTransaction(false);
      setQueue(prev => prev.map(q => ({ ...q, status: 'executed' as const })));
      setWatchedKeys([]);
    } else {
      setError(res.error);
    }
  };

  const handleDiscard = async () => {
    setError(null);
    setResult(null);
    const res = await window.api.txDiscard();
    if (res.success) {
      setInTransaction(false);
      setQueue([]);
      setWatchedKeys([]);
    } else {
      setError(res.error);
    }
  };

  const handleWatch = async () => {
    if (!watchInput.trim()) return;
    const keys = watchInput.split(/[,\s]+/).filter(Boolean);
    const res = await window.api.txWatch(keys);
    if (res.success) {
      setWatchedKeys(prev => [...new Set([...prev, ...keys])]);
      setWatchInput('');
    } else {
      setError(res.error);
    }
  };

  const handleQueueCommand = async () => {
    if (!commandInput.trim()) return;
    const parts = commandInput.trim().split(/\s+/);

    const res = await window.api.txQueueCommand(parts);
    setQueue(prev => [...prev, {
      id: nextId.current++,
      parts,
      status: res.success ? 'queued' : 'error',
    }]);
    setCommandInput('');
  };

  const handleReset = () => {
    setInTransaction(false);
    setQueue([]);
    setResult(null);
    setError(null);
    setWatchedKeys([]);
    window.api.txUnwatch();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Transaction Builder</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span className={`badge ${inTransaction ? 'badge-list' : 'badge-none'}`}>
            {inTransaction ? 'IN TRANSACTION' : 'IDLE'}
          </span>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 'var(--space-sm) var(--space-md)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--accent-rose-dim)',
          color: 'var(--accent-rose)',
          fontSize: 'var(--text-sm)',
        }}>
          ✕ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
        {/* Controls */}
        <div className="card">
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
            Transaction Controls
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <button className="btn-primary btn-sm" onClick={handleMulti} disabled={inTransaction}>
              MULTI
            </button>
            <button className="btn-primary btn-sm" onClick={handleExec} disabled={!inTransaction}>
              EXEC
            </button>
            <button className="btn-danger btn-sm" onClick={handleDiscard} disabled={!inTransaction}>
              DISCARD
            </button>
            <button className="btn-ghost btn-sm" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>

        {/* Watch Keys */}
        <div className="card">
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
            Watch Keys
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <input
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleWatch()}
              placeholder="key1, key2..."
              disabled={inTransaction}
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
            />
            <button className="btn-secondary btn-sm" onClick={handleWatch} disabled={inTransaction}>
              WATCH
            </button>
          </div>
          {watchedKeys.length > 0 && (
            <div style={{ marginTop: 'var(--space-sm)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
              {watchedKeys.map(k => (
                <span key={k} className="badge badge-amber" style={{ fontFamily: 'var(--font-mono)' }}>
                  👁 {k}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Command Queue */}
      {inTransaction && (
        <div className="card">
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
            Command Queue ({queue.length} commands)
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
            <input
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQueueCommand()}
              placeholder="SET key value..."
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
            />
            <button className="btn-primary btn-sm" onClick={handleQueueCommand}>
              Queue
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {queue.map((cmd, i) => (
              <div key={cmd.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                padding: 'var(--space-sm) var(--space-md)',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
              }}>
                <span style={{ color: 'var(--text-muted)', width: 24 }}>{i + 1}.</span>
                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{cmd.parts.join(' ')}</span>
                <span className={`badge ${cmd.status === 'queued' ? 'badge-string' : cmd.status === 'executed' ? 'badge-list' : 'badge-zset'}`}>
                  {cmd.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {result !== null && (
        <div className="card">
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--accent-emerald)' }}>
            ✓ Transaction Result
          </h3>
          <pre className="selectable mono" style={{
            background: 'var(--bg-tertiary)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            overflow: 'auto',
            maxHeight: 300,
            color: 'var(--text-primary)',
          }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
