import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar, View } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';
import { ConnectionDialog } from './components/connection/ConnectionDialog';
import { CommandConsole } from './components/console/CommandConsole';
import { KeyBrowser } from './components/browser/KeyBrowser';
import { Dashboard } from './components/dashboard/Dashboard';
import { PersistencePanel } from './components/persistence/PersistencePanel';
import { PubSubMonitor } from './components/pubsub/PubSubMonitor';
import { TransactionBuilder } from './components/transactions/TransactionBuilder';
import type { ConnectionStatus } from './types/ipc';

import './styles/globals.css';
import './styles/components.css';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('console');
  const [showConnectDialog, setShowConnectDialog] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus>({
    connected: false,
    ready: false,
    profileId: null,
    profileName: null,
    host: null,
    port: null,
    currentDb: 0,
  });

  useEffect(() => {
    window.api.onConnectionStatusChanged((newStatus) => {
      setStatus(newStatus);
      if (!newStatus.connected) {
        setShowConnectDialog(true);
      }
    });

    window.api.getConnectionStatus().then(setStatus);
  }, []);

  const handleConnected = () => {
    setShowConnectDialog(false);
    window.api.getConnectionStatus().then(setStatus);
  };

  const renderView = () => {
    if (!status.connected) {
      return (
        <div className="empty-state">
          <div className="empty-state__icon">
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" style={{ width: 64, height: 64 }}>
              <rect x="8" y="16" width="48" height="32" rx="4" />
              <line x1="20" y1="28" x2="44" y2="28" />
              <line x1="20" y1="36" x2="36" y2="36" />
              <circle cx="48" cy="20" r="4" fill="currentColor" opacity="0.4" />
            </svg>
          </div>
          <div className="empty-state__title">Not Connected</div>
          <div className="empty-state__desc">
            Connect to a RediForge server to start managing your data
          </div>
          <button className="btn-primary" onClick={() => setShowConnectDialog(true)}>
            Connect
          </button>
        </div>
      );
    }

    switch (activeView) {
      case 'console':     return <CommandConsole />;
      case 'browser':     return <KeyBrowser />;
      case 'dashboard':   return <Dashboard />;
      case 'persistence': return <PersistencePanel />;
      case 'pubsub':      return <PubSubMonitor />;
      case 'transactions': return <TransactionBuilder />;
      default:            return <CommandConsole />;
    }
  };

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-shell__body">
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          connected={status.connected}
        />
        <div className="app-shell__content" key={activeView}>
          {renderView()}
        </div>
      </div>
      <StatusBar status={status} />

      {showConnectDialog && (
        <ConnectionDialog
          onConnected={handleConnected}
          onCancel={status.connected ? () => setShowConnectDialog(false) : undefined}
          showCancel={status.connected}
        />
      )}
    </div>
  );
};

export default App;
