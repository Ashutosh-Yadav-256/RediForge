import React, { useState, useEffect, useCallback } from 'react';

interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  string: 'badge-string',
  list: 'badge-list',
  hash: 'badge-hash',
  set: 'badge-set',
  zset: 'badge-zset',
  none: 'badge-none',
};

export const KeyBrowser: React.FC = () => {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [cursor, setCursor] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchPattern, setSearchPattern] = useState('*');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('none');
  const [keyValue, setKeyValue] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [keyCount, setKeyCount] = useState(0);

  const loadKeys = useCallback(async (cursorVal: number = 0) => {
    setLoading(true);
    try {
      const result = await window.api.scanKeys(cursorVal, searchPattern, 50);
      const keyInfos: KeyInfo[] = [];

      for (const key of result.keys) {
        const type = await window.api.getKeyType(key as string);
        const ttl = await window.api.getKeyTTL(key as string);
        keyInfos.push({
          name: key as string,
          type: type as string,
          ttl: ttl as number,
        });
      }

      if (cursorVal === 0) {
        setKeys(keyInfos);
      } else {
        setKeys(prev => [...prev, ...keyInfos]);
      }

      setCursor(result.cursor);
      setHasMore(result.cursor > 0);
      setKeyCount(prev => cursorVal === 0 ? keyInfos.length : prev + keyInfos.length);
    } catch (err) {
      console.error('Failed to scan keys:', err);
    } finally {
      setLoading(false);
    }
  }, [searchPattern]);

  useEffect(() => {
    loadKeys(0);
  }, [loadKeys]);

  const selectKey = async (keyName: string) => {
    setSelectedKey(keyName);
    const type = await window.api.getKeyType(keyName);
    setSelectedType(type as string);

    try {
      const value = await window.api.getKeyValue(keyName, type as string);
      setKeyValue(value);
    } catch {
      setKeyValue(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedKey) return;
    if (!confirm(`Delete key "${selectedKey}"?`)) return;
    await window.api.deleteKeys([selectedKey]);
    setSelectedKey(null);
    setKeyValue(null);
    loadKeys(0);
  };

  const handleRefresh = () => {
    setSelectedKey(null);
    setKeyValue(null);
    loadKeys(0);
  };

  const formatTTL = (ttl: number): string => {
    if (ttl === -1) return '∞';
    if (ttl === -2) return 'expired';
    if (ttl < 60) return `${ttl}s`;
    if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
    return `${Math.floor(ttl / 3600)}h`;
  };

  const renderValue = () => {
    if (!selectedKey) {
      return (
        <div className="key-browser__detail-empty">
          <div className="empty-state">
            <div className="empty-state__title">Select a key</div>
            <div className="empty-state__desc">
              Choose a key from the list to view and edit its value
            </div>
          </div>
        </div>
      );
    }

    if (keyValue === null || keyValue === undefined) {
      return <div className="key-browser__detail-empty"><span className="mono">(nil)</span></div>;
    }

    switch (selectedType) {
      case 'string':
        return (
          <div style={{ padding: 'var(--space-lg)' }}>
            <textarea
              className="selectable"
              style={{
                width: '100%',
                minHeight: 200,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-md)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                resize: 'vertical',
              }}
              value={String(keyValue)}
              readOnly
            />
          </div>
        );

      case 'list':
        return (
          <div style={{ padding: 'var(--space-lg)' }}>
            <table className="config-table">
              <thead>
                <tr><th>Index</th><th>Value</th></tr>
              </thead>
              <tbody>
                {Array.isArray(keyValue) && keyValue.map((v: any, i: number) => (
                  <tr key={i}>
                    <td className="mono" style={{ width: 80 }}>{i}</td>
                    <td className="mono selectable">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'hash':
        return (
          <div style={{ padding: 'var(--space-lg)' }}>
            <table className="config-table">
              <thead>
                <tr><th>Field</th><th>Value</th></tr>
              </thead>
              <tbody>
                {typeof keyValue === 'object' && Object.entries(keyValue).map(([field, val]) => (
                  <tr key={field}>
                    <td className="mono">{field}</td>
                    <td className="mono selectable">{String(val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'set':
        return (
          <div style={{ padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
              {Array.isArray(keyValue) && keyValue.map((v: any, i: number) => (
                <span key={i} className="badge badge-set" style={{ fontSize: 'var(--text-sm)', padding: '4px 12px' }}>
                  {String(v)}
                </span>
              ))}
            </div>
          </div>
        );

      case 'zset':
        return (
          <div style={{ padding: 'var(--space-lg)' }}>
            <table className="config-table">
              <thead>
                <tr><th>Rank</th><th>Member</th><th>Score</th></tr>
              </thead>
              <tbody>
                {Array.isArray(keyValue) && (() => {
                  const rows: { member: string; score: string }[] = [];
                  for (let i = 0; i < keyValue.length; i += 2) {
                    rows.push({ member: String(keyValue[i]), score: String(keyValue[i + 1] || '0') });
                  }
                  return rows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ width: 60 }}>{i}</td>
                      <td className="mono selectable">{row.member}</td>
                      <td className="mono" style={{ width: 100, color: 'var(--accent-amber)' }}>{row.score}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        );

      default:
        return <div className="key-browser__detail-empty mono">{JSON.stringify(keyValue, null, 2)}</div>;
    }
  };

  return (
    <div className="key-browser">
      {}
      <div className="key-browser__list">
        <div className="key-browser__search">
          <input
            type="text"
            value={searchPattern}
            onChange={(e) => setSearchPattern(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadKeys(0)}
            placeholder="Search pattern (e.g., user:*)"
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
          />
        </div>

        <div className="key-browser__keys">
          {keys.map((k) => (
            <button
              key={k.name}
              className={`key-browser__key ${selectedKey === k.name ? 'key-browser__key--selected' : ''}`}
              onClick={() => selectKey(k.name)}
            >
              <span className={`badge ${TYPE_BADGE_CLASS[k.type] || 'badge-none'}`}>
                {k.type === 'string' ? 'STR' : k.type === 'zset' ? 'ZSET' : k.type.toUpperCase().slice(0, 4)}
              </span>
              <span className="key-browser__key-name">{k.name}</span>
              <span className="key-browser__key-ttl">{formatTTL(k.ttl)}</span>
            </button>
          ))}

          {keys.length === 0 && !loading && (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
              No keys found
            </div>
          )}

          {loading && (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              Scanning...
            </div>
          )}
        </div>

        <div className="key-browser__pagination">
          <span>{keyCount} keys loaded</span>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button className="btn-ghost btn-sm" onClick={handleRefresh}>↻ Refresh</button>
            {hasMore && (
              <button className="btn-secondary btn-sm" onClick={() => loadKeys(cursor)}>
                Load More
              </button>
            )}
          </div>
        </div>
      </div>

      {}
      <div className="key-browser__detail">
        {selectedKey && (
          <div className="key-browser__detail-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <span className={`badge ${TYPE_BADGE_CLASS[selectedType] || 'badge-none'}`}>
                {selectedType.toUpperCase()}
              </span>
              <span className="mono" style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
                {selectedKey}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button className="btn-ghost btn-sm" onClick={() => selectKey(selectedKey)}>↻</button>
              <button className="btn-danger btn-sm" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        )}

        <div className="key-browser__detail-body">
          {renderValue()}
        </div>
      </div>
    </div>
  );
};
