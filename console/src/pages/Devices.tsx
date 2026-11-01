import React, { useState, useEffect } from 'react';
import { HudFrame, StatusCard } from '@/components/hud';
import { api } from '@/lib/api';

interface Device {
  id: string;
  name: string;
  platform: string;
  lastActive: string;
  status: 'online' | 'offline';
}

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await api.get('/api/sessions');
        const sessions = res.data?.data || res.data || [];
        const mapped = sessions.map((s: any) => ({
          id: s.id,
          name: s.name || s.id,
          platform: 'WhatsApp',
          lastActive: s.lastActive || new Date().toISOString(),
          status: s.status === 'connected' ? 'online' as const : 'offline' as const,
        }));
        setDevices(mapped.length > 0 ? mapped : getMockDevices());
      } catch {
        setDevices(getMockDevices());
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
  }, []);

  const getMockDevices = (): Device[] => [
    { id: '1', name: 'Redmi 10A', platform: 'WhatsApp', lastActive: new Date().toISOString(), status: 'online' },
    { id: '2', name: 'iPhone 13', platform: 'WhatsApp', lastActive: new Date(Date.now() - 3600000).toISOString(), status: 'offline' },
    { id: '3', name: 'Samsung S22', platform: 'WhatsApp', lastActive: new Date(Date.now() - 7200000).toISOString(), status: 'offline' },
  ];

  const formatLastActive = (dateStr: string) => {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      padding: '20px',
      maxWidth: '1400px',
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
        }}>CONNECTED DEVICES</h1>
        <StatusCard label="TOTAL" value={devices.length.toString()} status="online" />
      </div>

      {loading ? (
        <HudFrame style={{ textAlign: 'center', padding: '60px' }}>
          <div className="hud-label">LOADING DEVICES...</div>
        </HudFrame>
      ) : devices.length === 0 ? (
        <HudFrame style={{ textAlign: 'center', padding: '60px' }}>
          <div className="hud-label">NO DEVICES CONNECTED</div>
          <div style={{ marginTop: '16px', color: 'var(--text-dim)' }}>
            Connect a device from WhatsApp Center
          </div>
        </HudFrame>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
          gap: '16px',
        }}>
          {devices.map((device) => (
            <HudFrame key={device.id} style={{ 
              minHeight: '180px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                borderBottom: '1px solid var(--cyan-border)',
                paddingBottom: '12px',
              }}>
                <div>
                  <div style={{ 
                    fontSize: '16px', 
                    fontWeight: '500', 
                    color: 'var(--cyan)',
                    letterSpacing: '1px',
                  }}>{device.name}</div>
                  <div className="hud-label">{device.platform}</div>
                </div>
                <StatusCard 
                  label="STATUS" 
                  value={device.status.toUpperCase()} 
                  status={device.status} 
                />
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                fontSize: '12px',
                color: 'var(--text-dim)',
              }}>
                <span>LAST ACTIVE: {formatLastActive(device.lastActive)}</span>
                <span>ID: {device.id.slice(0, 8)}...</span>
              </div>
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginTop: '8px',
              }}>
                <button style={{
                  flex: 1,
                  padding: '8px',
                  background: 'transparent',
                  border: '1px solid var(--cyan-border)',
                  color: 'var(--cyan)',
                  fontFamily: 'Share Tech Mono, monospace',
                  fontSize: '10px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}>
                  VIEW LOGS
                </button>
                <button style={{
                  flex: 1,
                  padding: '8px',
                  background: 'transparent',
                  border: '1px solid var(--cyan-border)',
                  color: 'var(--text-dim)',
                  fontFamily: 'Share Tech Mono, monospace',
                  fontSize: '10px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}>
                  DISCONNECT
                </button>
              </div>
            </HudFrame>
          ))}
        </div>
      )}
    </div>
  );
}