import React, { useState, useEffect } from 'react';
import { HudFrame, StatusCard } from '@/components/hud';
import { api } from '@/lib/api';

interface Session {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  qrCode?: string;
}

export function WhatsAppCenter() {
  const [session, setSession] = useState<Session | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const res = await api.get('/api/sessions');
      const sessions = res.data?.data || res.data || [];
      if (sessions.length > 0) {
        const s = sessions[0];
        setSession({
          id: s.id,
          name: s.name || s.id,
          status: s.status || 'disconnected',
        });
        if (s.qrCode) setQrCode(s.qrCode);
      }
    } catch {
      setMessage('Failed to load session');
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.post('/api/sessions', { name: 'AEGIS Session' });
      if (res.data?.qrCode) {
        setQrCode(res.data.qrCode);
        setSession({ id: res.data.id, name: 'AEGIS Session', status: 'connecting' });
        pollForConnection(res.data.id);
      }
      setMessage('QR generated - scan with WhatsApp');
    } catch {
      setMessage('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const pollForConnection = async (sessionId: string) => {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await api.get(`/api/sessions/${sessionId}`);
        if (res.data?.status === 'connected') {
          setSession({ ...res.data, status: 'connected' });
          setQrCode(null);
          setMessage('Connected successfully!');
          return;
        }
      } catch {}
    }
    setMessage('Connection timeout - try again');
  };

  const handleDisconnect = async () => {
    if (!session) return;
    setLoading(true);
    try {
      await api.delete(`/api/sessions/${session.id}`);
      setSession({ ...session, status: 'disconnected' });
      setQrCode(null);
      setMessage('Disconnected');
    } catch {
      setMessage('Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!session) return;
    setLoading(true);
    try {
      await api.post(`/api/sessions/${session.id}/logout`);
      setSession({ ...session, status: 'disconnected' });
      setQrCode(null);
      setMessage('Logged out');
    } catch {
      setMessage('Failed to logout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      padding: '20px',
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px',
        paddingBottom: '12px',
        borderBottom: '1px solid var(--cyan-border)',
      }}>
        <h1 style={{ 
          fontSize: '24px', 
          letterSpacing: '2px', 
          color: 'var(--cyan)',
          textTransform: 'uppercase',
        }}>WHATSAPP CENTER</h1>
        {session && (
          <StatusCard 
            label="SESSION" 
            value={session.status.toUpperCase()} 
            status={session.status === 'connected' ? 'online' : session.status === 'connecting' ? 'warning' : 'offline'} 
          />
        )}
      </div>

      {message && (
        <HudFrame style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div className="hud-label">{message}</div>
        </HudFrame>
      )}

      <div style={{ display: 'grid', gap: '16px' }}>
        {/* QR Code Section */}
        <HudFrame title="QR CODE" style={{ minHeight: '320px' }}>
          {qrCode ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ 
                padding: '20px', 
                background: 'rgba(0,0,0,0.5)', 
                border: '1px solid var(--cyan-border)',
                display: 'inline-block',
              }}>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrCode)}`} 
                  alt="WhatsApp QR Code"
                  style={{ display: 'block' }}
                />
              </div>
              <div className="hud-label">SCAN WITH WHATSAPP MOBILE APP</div>
              <div className="hud-label" style={{ color: 'var(--green-dot)' }}>
                Settings → Linked Devices → Link a Device
              </div>
            </div>
          ) : (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              minHeight: '240px',
              textAlign: 'center',
              gap: '16px',
            }}>
              <div style={{ fontSize: '48px', opacity: 0.3 }}>📱</div>
              <div className="hud-label">NO QR CODE GENERATED</div>
              <button 
                onClick={handleConnect}
                disabled={loading || session?.status === 'connected'}
                style={{
                  padding: '12px 32px',
                  background: 'transparent',
                  border: '1px solid var(--cyan-border)',
                  color: 'var(--cyan)',
                  fontFamily: 'Share Tech Mono, monospace',
                  fontSize: '11px',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? 'GENERATING...' : 'GENERATE QR CODE'}
              </button>
            </div>
          )}
        </HudFrame>

        {/* Session Controls */}
        {session && (
          <HudFrame title="SESSION CONTROLS" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '12px',
            minHeight: '180px',
          }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              gap: '12px',
            }}>
              <button 
                onClick={handleDisconnect}
                disabled={loading || session.status !== 'connected'}
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  border: '1px solid var(--cyan-border)',
                  color: 'var(--text-dim)',
                  fontFamily: 'Share Tech Mono, monospace',
                  fontSize: '11px',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                DISCONNECT
              </button>
              <button 
                onClick={handleLogout}
                disabled={loading}
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  border: '1px solid var(--cyan-border)',
                  color: 'var(--text-dim)',
                  fontFamily: 'Share Tech Mono, monospace',
                  fontSize: '11px',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                LOGOUT
              </button>
              <button 
                onClick={fetchSession}
                disabled={loading}
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  border: '1px solid var(--cyan-border)',
                  color: 'var(--cyan)',
                  fontFamily: 'Share Tech Mono, monospace',
                  fontSize: '11px',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                REFRESH STATUS
              </button>
            </div>
            <div className="hud-label">
              SESSION ID: {session.id} • NAME: {session.name}
            </div>
          </HudFrame>
        )}

        {/* Message Logs Preview */}
        <HudFrame title="MESSAGE LOGS // PREVIEW" style={{ minHeight: '200px' }}>
          <div className="hud-label">RECENT ACTIVITY</div>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px',
            marginTop: '12px',
            fontSize: '12px',
            fontFamily: 'JetBrains Mono, monospace',
          }}>
            <div style={{ display: 'flex', gap: '12px', color: 'var(--text-dim)' }}>
              <span>[SYSTEM]</span>
              <span>AEGIS-OS Console initialized</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', color: 'var(--green-dot)' }}>
              <span>[WHATSAPP]</span>
              <span>Gateway connected on port 2785</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', color: 'var(--cyan)' }}>
              <span>[API]</span>
              <span>Proxy active: /api/* → gateway:2785</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', color: 'var(--text-dim)' }}>
              <span>[HUD]</span>
              <span>Theme loaded: aegis-hud.css v1.0</span>
            </div>
          </div>
        </HudFrame>
      </div>
    </div>
  );
}