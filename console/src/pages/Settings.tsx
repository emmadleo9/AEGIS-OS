import React from 'react';
import { HudFrame, StatusCard } from '@/components/hud';
import { api } from '@/lib/api';

export function Settings() {
  const [apiKey, setApiKey] = React.useState('');
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem('aegis-api-key');
    if (stored) setApiKey(stored);
  }, []);

  const handleSave = () => {
    localStorage.setItem('aegis-api-key', apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      padding: '20px',
      maxWidth: '800px',
      margin: '0 auto',
    }}>
      <div style={{ 
        marginBottom: '24px',
        paddingBottom: '12px',
        borderBottom: '1px solid var(--cyan-border)',
      }}>
        <h1 style={{ 
          fontSize: '24px', 
          letterSpacing: '2px', 
          color: 'var(--cyan)',
          textTransform: 'uppercase',
        }}>SETTINGS</h1>
      </div>

      <HudFrame title="API CONFIGURATION" style={{ minHeight: '200px' }}>
        <div className="hud-label">AEGIS API KEY</div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key from gateway..."
            style={{
              flex: 1,
              minWidth: '300px',
              padding: '12px 16px',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid var(--cyan-border)',
              color: 'var(--text)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            style={{
              padding: '12px 24px',
              background: apiKey.trim() ? 'transparent' : 'rgba(138,248,255,0.1)',
              border: '1px solid var(--cyan-border)',
              color: apiKey.trim() ? 'var(--cyan)' : 'var(--text-dim)',
              fontFamily: 'Share Tech Mono, monospace',
              fontSize: '11px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              cursor: apiKey.trim() ? 'pointer' : 'not-allowed',
              opacity: apiKey.trim() ? 1 : 0.5,
            }}
          >
            SAVE
          </button>
          {saved && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              color: 'var(--green-dot)',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              ✓ SAVED TO LOCALSTORAGE
            </div>
          )}
        </div>
        <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-dim)' }}>
          Get your API key from the Gateway dashboard at <span style={{ color: 'var(--cyan)' }}>http://localhost:2785</span> → Settings → API Keys
        </div>
      </HudFrame>

      <HudFrame title="HUD THEME" style={{ minHeight: '180px' }}>
        <div className="hud-label">THEME: AEGIS HUD v1.0</div>
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
          <div>Primary: <span style={{ color: 'var(--cyan)' }}>#8AF8FF</span> (Cyan)</div>
          <div>Background: <span style={{ color: 'var(--cyan)' }}>#050A0E</span> (Deep Space)</div>
          <div>Panel: <span style={{ color: 'var(--cyan)' }}>rgba(8,24,30,0.88)</span> (Glass)</div>
          <div>Accent: <span style={{ color: '#00FF9C' }}>#00FF9C</span> (Neon Green)</div>
          <div>Font: <span style={{ color: 'var(--cyan)' }}>Share Tech Mono / Rajdhani / JetBrains Mono</span></div>
        </div>
      </HudFrame>

      <HudFrame title="EXTENSIBILITY" style={{ minHeight: '180px' }}>
        <div className="hud-label">FUTURE GATEWAYS</div>
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-dim)', lineHeight: 2 }}>
          <div>→ All new gateways MUST import <span style={{ color: 'var(--cyan)' }}>@/styles/aegis-hud.css</span></div>
          <div>→ Use <span style={{ color: 'var(--cyan)' }}>HudFrame</span>, <span style={{ color: 'var(--cyan)' }}>GaugeCircle</span>, <span style={{ color: 'var(--cyan)' }}>StatusCard</span></div>
          <div>→ No custom CSS allowed - single source of truth</div>
          <div>→ Feature folders in <span style={{ color: 'var(--cyan)' }}>src/features/[gateway]/</span></div>
        </div>
      </HudFrame>
    </div>
  );
}