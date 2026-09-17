import React, { useState, useEffect, useRef } from 'react';

interface PubSubMessage {
  id: number;
  timestamp: number;
  channel: string;
  message: string;
}

export const PubSubMonitor: React.FC = () => {
  const [subscribedChannels, setSubscribedChannels] = useState<string[]>([]);
  const [messages, setMessages] = useState<PubSubMessage[]>([]);
  const [channelInput, setChannelInput] = useState('');
  const [publishChannel, setPublishChannel] = useState('');
  const [publishMessage, setPublishMessage] = useState('');
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    window.api.onPubSubMessage((msg) => {
      if (Array.isArray(msg.data)) {
        const [type, channel, payload] = msg.data;
        if (type === 'message' || type === 'pmessage') {
          setMessages(prev => [...prev.slice(-500), {
            id: nextId.current++,
            timestamp: msg.timestamp,
            channel: String(channel),
            message: String(payload || msg.data[3] || ''),
          }]);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubscribe = async () => {
    if (!channelInput.trim()) return;
    const channel = channelInput.trim();
    const result = await window.api.subscribe(channel);
    if (result.success) {
      setSubscribedChannels(prev => [...new Set([...prev, channel])]);
      setChannelInput('');
    }
  };

  const handleUnsubscribe = async (channel: string) => {
    await window.api.unsubscribe(channel);
    setSubscribedChannels(prev => prev.filter(c => c !== channel));
  };

  const handlePublish = async () => {
    if (!publishChannel.trim() || !publishMessage.trim()) return;
    const result = await window.api.publish(publishChannel, publishMessage);
    if (result.success) {
      setPublishResult(`Delivered to ${result.receivers} subscriber(s)`);
      setPublishMessage('');
    } else {
      setPublishResult(`Error: ${result.error}`);
    }
    setTimeout(() => setPublishResult(null), 3000);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', height: '100%' }}>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Pub/Sub Monitor</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
        {}
        <div className="card">
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
            Subscribe
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <input
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubscribe()}
              placeholder="Channel name..."
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
            />
            <button className="btn-primary btn-sm" onClick={handleSubscribe}>Subscribe</button>
          </div>

          {subscribedChannels.length > 0 && (
            <div style={{ marginTop: 'var(--space-md)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
              {subscribedChannels.map(ch => (
                <span key={ch} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-sm)',
                  padding: '2px 8px', borderRadius: 'var(--radius-full)',
                  background: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)',
                  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)',
                }}>
                  {ch}
                  <button
                    onClick={() => handleUnsubscribe(ch)}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {}
        <div className="card">
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
            Publish
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <input
              value={publishChannel}
              onChange={(e) => setPublishChannel(e.target.value)}
              placeholder="Channel..."
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
            />
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <input
                value={publishMessage}
                onChange={(e) => setPublishMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePublish()}
                placeholder="Message..."
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
              />
              <button className="btn-primary btn-sm" onClick={handlePublish}>Publish</button>
            </div>
            {publishResult && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-emerald)' }}>{publishResult}</div>
            )}
          </div>
        </div>
      </div>

      {}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Message Stream ({messages.length})
          </h3>
          <button className="btn-ghost btn-sm" onClick={() => setMessages([])}>Clear</button>
        </div>

        <div ref={messagesRef} style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
          {messages.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-xl)' }}>
              No messages yet. Subscribe to a channel to see live messages.
            </div>
          ) : messages.map((msg) => (
            <div key={msg.id} style={{
              display: 'flex', gap: 'var(--space-md)', padding: 'var(--space-xs) 0',
              borderBottom: '1px solid var(--border-subtle)',
              animation: 'fadeIn 0.15s ease both',
            }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatTime(msg.timestamp)}</span>
              <span style={{ color: 'var(--accent-cyan)', flexShrink: 0 }}>{msg.channel}</span>
              <span className="selectable" style={{ color: 'var(--text-primary)' }}>{msg.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
