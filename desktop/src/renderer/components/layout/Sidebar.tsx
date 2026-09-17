import React from 'react';

export type View = 'console' | 'browser' | 'dashboard' | 'persistence' | 'pubsub' | 'transactions';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  connected: boolean;
}

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
  section?: string;
}

const TerminalIcon = () => (
  <svg className="sidebar__icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="3" width="16" height="12" rx="2" />
    <polyline points="5,8 8,10 5,12" />
    <line x1="10" y1="12" x2="13" y2="12" />
  </svg>
);

const BrowserIcon = () => (
  <svg className="sidebar__icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="6" height="6" rx="1" />
    <rect x="10" y="2" width="6" height="6" rx="1" />
    <rect x="2" y="10" width="6" height="6" rx="1" />
    <rect x="10" y="10" width="6" height="6" rx="1" />
  </svg>
);

const DashboardIcon = () => (
  <svg className="sidebar__icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="9" width="4" height="7" rx="1" />
    <rect x="7" y="5" width="4" height="11" rx="1" />
    <rect x="12" y="2" width="4" height="14" rx="1" />
  </svg>
);

const PersistenceIcon = () => (
  <svg className="sidebar__icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 5C3 3.89543 3.89543 3 5 3H13C14.1046 3 15 3.89543 15 5V13C15 14.1046 14.1046 15 13 15H5C3.89543 15 3 14.1046 3 13V5Z" />
    <path d="M6 3V7H12V3" />
    <path d="M10 5V6" />
  </svg>
);

const PubSubIcon = () => (
  <svg className="sidebar__icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="9" r="2" />
    <path d="M5 5C3.5 6.5 3 8 3 9C3 10 3.5 11.5 5 13" />
    <path d="M13 5C14.5 6.5 15 8 15 9C15 10 14.5 11.5 13 13" />
  </svg>
);

const TransactionIcon = () => (
  <svg className="sidebar__icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="14" height="3" rx="1" />
    <rect x="2" y="8" width="14" height="3" rx="1" />
    <rect x="2" y="13" width="14" height="3" rx="1" />
    <polyline points="14,4.5 16,4.5" strokeWidth="2" />
  </svg>
);

const navItems: NavItem[] = [
  { id: 'console', label: 'Console', icon: <TerminalIcon /> },
  { id: 'browser', label: 'Key Browser', icon: <BrowserIcon /> },
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'persistence', label: 'Persistence', icon: <PersistenceIcon />, section: 'Management' },
  { id: 'pubsub', label: 'Pub/Sub', icon: <PubSubIcon /> },
  { id: 'transactions', label: 'Transactions', icon: <TransactionIcon /> },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, connected }) => {
  let currentSection = '';

  return (
    <div className="sidebar">
      <div className="sidebar__nav">
        {navItems.map((item) => {
          const showSection = item.section && item.section !== currentSection;
          if (item.section) currentSection = item.section;

          return (
            <React.Fragment key={item.id}>
              {showSection && <div className="sidebar__section">{item.section}</div>}
              <button
                className={`sidebar__item ${activeView === item.id ? 'sidebar__item--active' : ''}`}
                onClick={() => onViewChange(item.id)}
                disabled={!connected && item.id !== 'console'}
                title={!connected && item.id !== 'console' ? 'Connect to a server first' : undefined}
              >
                {item.icon}
                {item.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <div className="sidebar__footer">
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          RediForge v1.0
        </div>
      </div>
    </div>
  );
};
