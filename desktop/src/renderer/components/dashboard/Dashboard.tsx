import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ServerInfo } from '../../types/ipc';

interface MetricsSnapshot {
  timestamp: number;
  memoryUsed: number;
  totalKeys: number;
  connectedClients: number;
  uptime: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${seconds % 60}s`;
}

export const Dashboard: React.FC = () => {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [history, setHistory] = useState<MetricsSnapshot[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysCanvasRef = useRef<HTMLCanvasElement>(null);

  const fetchInfo = useCallback(async () => {
    const data = await window.api.getServerInfo();
    if (data) {
      setInfo(data);

      const memUsed = parseInt(data.memory?.used_memory || '0', 10);
      let totalKeys = 0;
      for (const dbKey in data.keyspace) {
        totalKeys += data.keyspace[dbKey].keys;
      }

      setHistory(prev => {
        const snapshot: MetricsSnapshot = {
          timestamp: Date.now(),
          memoryUsed: memUsed,
          totalKeys,
          connectedClients: parseInt(data.clients?.connected_clients || '0', 10),
          uptime: parseInt(data.server?.uptime_in_seconds || '0', 10),
        };
        const updated = [...prev, snapshot];
        // Keep 5 minutes of data (150 points at 2s intervals)
        return updated.slice(-150);
      });
    }
  }, []);

  // Poll every 2 seconds
  useEffect(() => {
    fetchInfo();
    const timer = setInterval(fetchInfo, 2000);
    return () => clearInterval(timer);
  }, [fetchInfo]);

  // Draw memory chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 10, right: 10, bottom: 20, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    const memValues = history.map(s => s.memoryUsed);
    const maxMem = Math.max(...memValues, 1);
    const minMem = Math.min(...memValues);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      const val = maxMem - ((maxMem - minMem) * i) / 4;
      ctx.fillText(formatBytes(val), padding.left - 6, y + 4);
    }

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)');

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    const range = maxMem - minMem || 1;

    for (let i = 0; i < history.length; i++) {
      const x = padding.left + (i / (history.length - 1)) * chartW;
      const y = padding.top + chartH - ((memValues[i] - minMem) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill area
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }, [history]);

  // Draw keyspace bar chart
  useEffect(() => {
    const canvas = keysCanvasRef.current;
    if (!canvas || !info) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 10, right: 10, bottom: 30, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    const dbEntries = Object.entries(info.keyspace);
    if (dbEntries.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No keys in any database', w / 2, h / 2);
      return;
    }

    const maxKeys = Math.max(...dbEntries.map(([, v]) => v.keys), 1);
    const barWidth = Math.min(40, (chartW / dbEntries.length) * 0.6);
    const barGap = (chartW - barWidth * dbEntries.length) / (dbEntries.length + 1);

    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#f43f5e',
      '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
    ];

    dbEntries.forEach(([dbName, data], i) => {
      const x = padding.left + barGap + i * (barWidth + barGap);
      const barH = (data.keys / maxKeys) * chartH;
      const y = padding.top + chartH - barH;

      // Bar with gradient
      const grad = ctx.createLinearGradient(x, y, x, padding.top + chartH);
      grad.addColorStop(0, colors[i % colors.length]);
      grad.addColorStop(1, colors[i % colors.length] + '40');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dbName, x + barWidth / 2, padding.top + chartH + 16);

      // Value on top
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(String(data.keys), x + barWidth / 2, y - 6);
    });
  }, [info]);

  const memUsed = info ? parseInt(info.memory?.used_memory || '0', 10) : 0;
  const memRss = info ? parseInt(info.memory?.used_memory_rss || '0', 10) : 0;
  const clients = info ? parseInt(info.clients?.connected_clients || '0', 10) : 0;
  const uptime = info ? parseInt(info.server?.uptime_in_seconds || '0', 10) : 0;

  let totalKeys = 0;
  if (info) {
    for (const key in info.keyspace) {
      totalKeys += info.keyspace[key].keys;
    }
  }

  return (
    <div className="dashboard animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Server Dashboard</h2>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          Polling every 2s • {history.length} data points
        </span>
      </div>

      {/* Metric Cards */}
      <div className="dashboard__cards">
        <div className="metric-card metric-card--accent-blue">
          <div className="metric-card__label">Memory Used</div>
          <div className="metric-card__value">{formatBytes(memUsed)}</div>
        </div>
        <div className="metric-card metric-card--accent-emerald">
          <div className="metric-card__label">Total Keys</div>
          <div className="metric-card__value">{totalKeys.toLocaleString()}</div>
        </div>
        <div className="metric-card metric-card--accent-amber">
          <div className="metric-card__label">Connected Clients</div>
          <div className="metric-card__value">{clients}</div>
        </div>
        <div className="metric-card metric-card--accent-purple">
          <div className="metric-card__label">Uptime</div>
          <div className="metric-card__value" style={{ fontSize: 'var(--text-xl)' }}>
            {formatUptime(uptime)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-card__label">RSS Memory</div>
          <div className="metric-card__value" style={{ fontSize: 'var(--text-lg)' }}>
            {formatBytes(memRss)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-card__label">Node Version</div>
          <div className="metric-card__value" style={{ fontSize: 'var(--text-lg)' }}>
            {info?.server?.redis_version || '—'}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="dashboard__charts">
        <div className="chart-container">
          <div className="chart-container__title">Memory Usage Over Time</div>
          <canvas ref={canvasRef} style={{ width: '100%', height: 200 }} />
        </div>
        <div className="chart-container">
          <div className="chart-container__title">Keys Per Database</div>
          <canvas ref={keysCanvasRef} style={{ width: '100%', height: 200 }} />
        </div>
      </div>

      {/* Server Info */}
      {info && (
        <div className="card">
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
            Server Information
          </h3>
          <table className="config-table">
            <tbody>
              {Object.entries(info.server || {}).map(([key, val]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td className="mono selectable">{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
