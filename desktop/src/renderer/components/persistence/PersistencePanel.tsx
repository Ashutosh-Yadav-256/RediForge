import React, { useState, useEffect } from 'react';

const EDITABLE_CONFIGS = [
  { key: 'port', label: 'Port', type: 'number', readOnly: true },
  { key: 'bind', label: 'Bind Address', type: 'text', readOnly: true },
  { key: 'databases', label: 'Databases', type: 'number', readOnly: true },
  { key: 'maxmemory', label: 'Max Memory (bytes)', type: 'number', readOnly: false },
  { key: 'maxmemory_policy', label: 'Eviction Policy', type: 'text', readOnly: false },
  { key: 'hz', label: 'Hz (background frequency)', type: 'number', readOnly: false },
  { key: 'loglevel', label: 'Log Level', type: 'text', readOnly: false },
  { key: 'appendonly', label: 'AOF Enabled', type: 'text', readOnly: false },
  { key: 'appendfsync', label: 'AOF Fsync Policy', type: 'text', readOnly: false },
  { key: 'timeout', label: 'Client Timeout', type: 'number', readOnly: false },
];

export const PersistencePanel: React.FC = () => {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [currentDb, setCurrentDb] = useState(0);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const result = await window.api.configGetAll();
    if (result && !('error' in result)) {
      setConfig(result);
      setEditValues(result);
    }
  };

  const handleSave = async (key: string) => {
    setSaving(key);
    setStatus(null);

    try {
      const result = await window.api.configSet(key, editValues[key]);
      if (result.success) {
        setConfig(prev => ({ ...prev, [key]: editValues[key] }));
        setStatus({ message: `${key} updated successfully`, type: 'success' });
      } else {
        setStatus({ message: result.error || 'Failed to update', type: 'error' });
      }
    } catch (err: any) {
      setStatus({ message: err.message, type: 'error' });
    } finally {
      setSaving(null);
    }

    setTimeout(() => setStatus(null), 3000);
  };

  const handleSelectDb = async (db: number) => {
    try {
      const result = await window.api.selectDb(db);
      if (result.success) {
        setCurrentDb(db);
        setStatus({ message: `Switched to database ${db}`, type: 'success' });
      }
    } catch (err: any) {
      setStatus({ message: err.message, type: 'error' });
    }
    setTimeout(() => setStatus(null), 3000);
  };

  return (
    <div className="persistence-panel animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Persistence & Configuration</h2>
      </div>

      {status && (
        <div style={{
          padding: 'var(--space-sm) var(--space-md)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-sm)',
          background: status.type === 'success' ? 'var(--accent-emerald-dim)' : 'var(--accent-rose-dim)',
          color: status.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
        }}>
          {status.type === 'success' ? '' : ''} {status.message}
        </div>
      )}

      {}
      <div className="card">
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
          Database Selection
        </h3>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          {Array.from({ length: 16 }, (_, i) => (
            <button
              key={i}
              className={currentDb === i ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => handleSelectDb(i)}
              style={{ minWidth: 40 }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      {}
      <div className="card">
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
          Persistence Status
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              RDB Snapshot
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <span className="badge badge-string">Active</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {config.rdb_filename || 'dump.rdb'}
              </span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              AOF Persistence
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <span className={`badge ${config.appendonly === 'true' ? 'badge-list' : 'badge-none'}`}>
                {config.appendonly === 'true' ? 'Enabled' : 'Disabled'}
              </span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {config.appendfsync || 'everysec'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <button className="btn-primary btn-sm" onClick={() => window.api.triggerSave()}>
             Trigger Snapshot
          </button>
        </div>
      </div>

      {}
      <div className="card">
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
          Runtime Configuration
        </h3>
        <table className="config-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {EDITABLE_CONFIGS.map(({ key, label, readOnly }) => (
              <tr key={key}>
                <td>
                  <div>{key}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    {label}
                  </div>
                </td>
                <td>
                  <input
                    value={editValues[key] || ''}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                    readOnly={readOnly}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      opacity: readOnly ? 0.5 : 1,
                      cursor: readOnly ? 'not-allowed' : 'text',
                    }}
                  />
                </td>
                <td>
                  {!readOnly && editValues[key] !== config[key] && (
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => handleSave(key)}
                      disabled={saving === key}
                    >
                      {saving === key ? '...' : 'Save'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
