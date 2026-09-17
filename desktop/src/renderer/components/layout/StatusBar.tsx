import React from 'react';
import type { ConnectionStatus } from '../../types/ipc';

interface StatusBarProps {
  status: ConnectionStatus;
}

export const StatusBar: React.FC<StatusBarProps> = ({ status }) => {
  return (
    <div className="statusbar">
      <div className="statusbar__item">
        <span className={`statusbar__dot ${status.connected ? 'statusbar__dot--connected' : 'statusbar__dot--disconnected'}`} />
        <span>{status.connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      {status.connected && (
        <>
          <div className="statusbar__item">
            <span style={{ color: 'var(--text-muted)' }}>Host:</span>
            <span className="mono">{status.host}:{status.port}</span>
          </div>
          <div className="statusbar__item">
            <span style={{ color: 'var(--text-muted)' }}>DB:</span>
            <span className="mono">{status.currentDb}</span>
          </div>
          {status.profileName && (
            <div className="statusbar__item">
              <span style={{ color: 'var(--accent-blue)' }}>{status.profileName}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
