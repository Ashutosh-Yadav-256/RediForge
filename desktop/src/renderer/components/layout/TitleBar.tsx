import React, { useState } from 'react';
import { AboutModal } from './AboutModal';

export const TitleBar: React.FC = () => {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <>
      <div className="titlebar">
        <div className="titlebar__brand">
          <div className="titlebar__logo" />
          <span className="titlebar__name">RediForge Desktop</span>
          <button
            className="titlebar__btn"
            style={{ width: 'auto', padding: '0 8px', fontSize: '11px', color: 'var(--text-muted)' }}
            onClick={() => setShowAbout(true)}
            title="About RediForge Desktop"
          >
            About
          </button>
        </div>
        <div className="titlebar__controls">
          <button className="titlebar__btn" onClick={() => window.api.minimizeWindow()} title="Minimize">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="7" x2="11" y2="7" />
            </svg>
          </button>
          <button className="titlebar__btn" onClick={() => window.api.maximizeWindow()} title="Maximize">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="8" height="8" rx="1" />
            </svg>
          </button>
          <button className="titlebar__btn titlebar__btn--close" onClick={() => window.api.closeWindow()} title="Close">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="3" x2="11" y2="11" />
              <line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
        </div>
      </div>
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </>
  );
};
