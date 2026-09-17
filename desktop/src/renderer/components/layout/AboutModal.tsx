import React, { useEffect, useState } from 'react';
import type { AppInfo } from '../../types/ipc';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    if (isOpen) {
      window.api.getAppInfo().then(setInfo).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(5, 8, 16, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: 480,
          maxWidth: '90vw',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-accent)',
          boxShadow: 'var(--shadow-xl)',
          padding: 'var(--space-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(220, 38, 38, 0.4)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ width: 28, height: 28 }}>
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              RediForge Desktop Admin
            </h2>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-red)', fontWeight: 600 }}>
              Version {info?.version || '1.0.0'}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-lg)' }}>
          A native, high-performance desktop administration client for RediForge in-memory data store.
          Connects via raw TCP over RESP2 wire protocol with zero external Redis client dependencies.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', background: 'var(--bg-input)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', marginBottom: 'var(--space-lg)', fontSize: 'var(--text-xs)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Architecture:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>Electron Main / Sandboxed Renderer</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Security:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>ContextIsolation + SafeStorage DPAPI</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Protocol:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>RESP2 Binary TCP Framing</span>
          </div>
          {info && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Electron:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>v{info.electron}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Node.js:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>v{info.node} ({info.platform} {info.arch})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Chromium:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>v{info.chrome}</span>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Designed & Developed by Ashutosh Yadav
          </span>
          <button className="btn-primary" style={{ padding: '6px 16px' }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
