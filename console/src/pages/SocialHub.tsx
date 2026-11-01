import React from 'react';
import { HudFrame, StatusCard } from '@/components/hud';

const platforms = [
  { id: 'whatsapp', name: 'WhatsApp', status: 'online' as const, icon: '💬', color: '#25D366' },
  { id: 'instagram', name: 'Instagram', status: 'offline' as const, icon: '📷', color: '#E4405F' },
  { id: 'discord', name: 'Discord', status: 'offline' as const, icon: '🎮', color: '#5865F2' },
  { id: 'telegram', name: 'Telegram', status: 'offline' as const, icon: '✈️', color: '#0088CC' },
];

export function SocialHub() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      padding: '20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '16px',
      maxWidth: '1200px',
      margin: '0 auto',
    }}>
      {platforms.map((platform) => (
        <HudFrame key={platform.id} title={platform.name} style={{ 
          minHeight: '200px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '16px',
        }}>
          <div style={{ 
            fontSize: '48px',
            filter: platform.status === 'online' ? 'drop-shadow(0 0 15px rgba(138,248,255,0.8))' : 'opacity(0.4)',
          }}>
            {platform.icon}
          </div>
          <StatusCard
            label="STATUS"
            value={platform.status === 'online' ? 'ONLINE' : 'COMING SOON'}
            status={platform.status}
            className="w-full"
          />
          <button 
            disabled={platform.status !== 'online'}
            style={{
              padding: '8px 24px',
              background: 'transparent',
              border: '1px solid var(--cyan-border)',
              color: platform.status === 'online' ? 'var(--cyan)' : 'var(--text-dim)',
              fontFamily: 'Share Tech Mono, monospace',
              fontSize: '11px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              cursor: platform.status === 'online' ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              width: '100%',
              maxWidth: '200px',
            }}
          >
            {platform.status === 'online' ? 'CONNECT' : 'COMING SOON'}
          </button>
          <div style={{ 
            fontSize: '10px', 
            color: 'var(--text-dim)',
            marginTop: '8px',
          }}>
            {platform.status !== 'online' && 'TODO: EXTENDABLE - Add API plug for new gateway'}
          </div>
        </HudFrame>
      ))}
    </div>
  );
}