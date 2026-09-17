import React, { useState, useEffect } from 'react';
import type { ConnectionProfile, ConnectResult } from '../../types/ipc';

interface ConnectionDialogProps {
  onConnected: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export const ConnectionDialog: React.FC<ConnectionDialogProps> = ({ onConnected, onCancel, showCancel }) => {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'form' | 'saved'>('form');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('6379');
  const [name, setName] = useState('Local Server');
  const [password, setPassword] = useState('');
  const [db, setDb] = useState('0');
  const [saveProfileChecked, setSaveProfileChecked] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSavedProfiles();
  }, []);

  const loadSavedProfiles = async () => {
    try {
      const saved = await window.api.getSavedConnections();
      if (Array.isArray(saved)) {
        setProfiles(saved);
        if (saved.length > 0 && !name) {
          setName(saved[0].name);
          setHost(saved[0].host);
          setPort(String(saved[0].port));
          setDb(String(saved[0].db || 0));
        }
      }
    } catch (err) {
      console.error('Failed to load saved profiles:', err);
    }
  };

  const handleSelectProfile = (p: ConnectionProfile) => {
    setName(p.name);
    setHost(p.host);
    setPort(String(p.port));
    setPassword(p.password || '');
    setDb(String(p.db || 0));
    setActiveTab('form');
  };

  const handleDeleteProfile = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await window.api.deleteConnection(id);
      await loadSavedProfiles();
    } catch (err: any) {
      setError(err.message || 'Failed to delete profile');
    }
  };

  const handleConnectWithProfile = async (targetProfile: ConnectionProfile) => {
    setConnecting(true);
    setError(null);

    try {
      const result: ConnectResult = await window.api.connect(targetProfile);
      if (result.success) {
        onConnected();
      } else {
        setError(result.error || 'Connection failed');
      }
    } catch (err: any) {
      setError(err.message || 'Unexpected error');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    const profile: ConnectionProfile = {
      id: `${host}:${port}:${name.toLowerCase().replace(/\s+/g, '-')}`,
      name: name || `${host}:${port}`,
      host,
      port: parseInt(port, 10),
      password: password || undefined,
      db: parseInt(db, 10) || 0,
      color: '#dc2626',
    };

    try {
      const result: ConnectResult = await window.api.connect(profile);
      if (result.success) {
        if (saveProfileChecked) {
          await window.api.saveConnection(profile);
        }
        onConnected();
      } else {
        setError(result.error || 'Connection failed');
      }
    } catch (err: any) {
      setError(err.message || 'Unexpected error');
    } finally {
      setConnecting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !connecting) {
      handleConnect();
    }
  };

  return (
    <div className="connection-dialog">
      <div className="connection-dialog__card" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
          <h2 className="connection-dialog__title" style={{ margin: 0 }}>Connect to RediForge</h2>
          {profiles.length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-xs)', background: 'var(--bg-card)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                className={`btn-ghost ${activeTab === 'form' ? 'btn-secondary' : ''}`}
                style={{ padding: '3px 10px', fontSize: 'var(--text-xs)' }}
                onClick={() => setActiveTab('form')}
              >
                New / Edit
              </button>
              <button
                type="button"
                className={`btn-ghost ${activeTab === 'saved' ? 'btn-secondary' : ''}`}
                style={{ padding: '3px 10px', fontSize: 'var(--text-xs)' }}
                onClick={() => setActiveTab('saved')}
              >
                Saved ({profiles.length})
              </button>
            </div>
          )}
        </div>

        <p className="connection-dialog__subtitle">
          {activeTab === 'form'
            ? 'Enter your server details to establish a native RESP2 TCP connection'
            : 'Select a saved connection profile or click to connect instantly'}
        </p>

        {activeTab === 'saved' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', margin: 'var(--space-md) 0' }}>
            {profiles.map((p) => (
              <div
                key={p.id}
                onClick={() => handleSelectProfile(p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-sm) var(--space-md)',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'border-color var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-red)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || 'var(--accent-red)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{p.name}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {p.host}:{p.port} (DB {p.db || 0})
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConnectWithProfile(p);
                    }}
                    disabled={connecting}
                  >
                    Connect
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: '4px 8px', color: 'var(--accent-red)', fontSize: 'var(--text-xs)' }}
                    onClick={(e) => handleDeleteProfile(e, p.id)}
                    title="Delete profile"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="connection-dialog__form" onKeyDown={handleKeyDown}>
            <div className="connection-dialog__field">
              <label className="connection-dialog__label">Connection Name</label>
              <input
                className="connection-dialog__input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Local Server"
                autoFocus
              />
            </div>

            <div className="connection-dialog__row">
              <div className="connection-dialog__field">
                <label className="connection-dialog__label">Host</label>
                <input
                  className="connection-dialog__input"
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="127.0.0.1"
                />
              </div>
              <div className="connection-dialog__field" style={{ maxWidth: 120 }}>
                <label className="connection-dialog__label">Port</label>
                <input
                  className="connection-dialog__input"
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="6379"
                />
              </div>
            </div>

            <div className="connection-dialog__row">
              <div className="connection-dialog__field">
                <label className="connection-dialog__label">Password (optional)</label>
                <input
                  className="connection-dialog__input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                />
              </div>
              <div className="connection-dialog__field" style={{ maxWidth: 80 }}>
                <label className="connection-dialog__label">Database</label>
                <input
                  className="connection-dialog__input"
                  type="text"
                  value={db}
                  onChange={(e) => setDb(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', margin: 'var(--space-xs) 0' }}>
              <input
                type="checkbox"
                id="saveProfileCheck"
                checked={saveProfileChecked}
                onChange={(e) => setSaveProfileChecked(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--accent-red)' }}
              />
              <label htmlFor="saveProfileCheck" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Save connection profile (passwords encrypted securely with OS SafeStorage)
              </label>
            </div>

            {error && (
              <div className="connection-dialog__error">
                ✕ {error}
              </div>
            )}

            <div className="connection-dialog__actions">
              {showCancel && (
                <button className="btn-secondary" onClick={onCancel}>Cancel</button>
              )}
              <button
                className="btn-primary"
                onClick={handleConnect}
                disabled={connecting || !host || !port}
              >
                {connecting ? (
                  <>
                    <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
