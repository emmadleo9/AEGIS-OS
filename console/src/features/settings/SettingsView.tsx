import { useCallback, useEffect, useState } from 'react';
import { HudFrame } from '@/components/hud';

type KeyEntry = { id: string; label: string; url: string; scope: string; connected: boolean; masked: string };

export function SettingsView() {
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/keys');
      const data = await response.json() as { keys?: KeyEntry[] };
      setKeys(data.keys ?? []);
    } catch {
      setMessage('Gateway unreachable — start the local gateway first.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connect = async (id: string) => {
    const value = drafts[id]?.trim();
    if (!value) {
      setMessage(`Paste YOUR ${id} key first — open the provider link, sign in with your account, copy the key.`);
      return;
    }
    setBusy(id);
    try {
      const response = await fetch(`/api/keys/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setDrafts((current) => ({ ...current, [id]: '' }));
      setMessage(`${id} connected — stored on Disk D (config/keys.json), never committed.`);
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy('');
    }
  };

  const disconnect = async (id: string) => {
    await fetch(`/api/keys/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await load();
    setMessage(`${id} removed.`);
  };

  return (
    <div className="settings-stack">
      <HudFrame title="MY ACCOUNTS // API CONNECTIONS">
        <p className="credential-notice">
          Every API in AEGIS runs on YOUR accounts — no fake keys, no demo accounts. Sign in at each provider with your own login, generate a key, paste it below. Keys persist to <strong>D:\AEGIS-OS-STORAGE\config\keys.json</strong> and never leave this machine.
        </p>
        <div className="settings-key-grid">
          {keys.map((entry) => (
            <div className="settings-key" key={entry.id}>
              <div className="settings-key-head">
                <strong>{entry.label}</strong>
                <span className={`status-dot${entry.connected ? '' : ' status-dot-offline'}`} />
                <small>{entry.connected ? 'CONNECTED' : 'NOT CONNECTED'}</small>
              </div>
              <small className="settings-key-scope">{entry.scope} · <a href={entry.url} target="_blank" rel="noreferrer" className="hud-link">LOGIN TO GET KEY →</a></small>
              <div className="settings-key-row">
                <input
                  aria-label={`${entry.label} API key`}
                  type="password"
                  autoComplete="off"
                  value={drafts[entry.id] ?? ''}
                  onChange={(event) => setDrafts((current) => ({ ...current, [entry.id]: event.target.value }))}
                  placeholder={entry.connected ? entry.masked : 'Paste your key…'}
                />
                <button type="button" className="hud-button" onClick={() => void connect(entry.id)} disabled={busy === entry.id}>
                  {busy === entry.id ? 'SAVING…' : 'CONNECT WITH MY ACCOUNT'}
                </button>
                {entry.connected && <button type="button" className="hud-button" onClick={() => void disconnect(entry.id)}>REMOVE</button>}
              </div>
            </div>
          ))}
          {keys.length === 0 && <p className="inline-status">Loading key registry from gateway…</p>}
        </div>
        {message && <p className="inline-status">{message}</p>}
      </HudFrame>

      <HudFrame title="REQUIRED FOR FULL POWER">
        <div className="settings-required">
          <div><strong>NVIDIA NIM</strong> — chat (Llama 405B), image (Flux.1, SD 3.5), vision (Llama 3.2), unlocks AI Studio NEXUS mode.</div>
          <div><strong>Cesium ion</strong> — 3D terrain, satellite and buildings tiles for World View.</div>
          <div><strong>OpenWeatherMap</strong> — thermal, wind, precipitation overlay layers in Weather Intel.</div>
          <div><strong>ElevenLabs</strong> — premium British TTS voice for NOVA.</div>
          <div><strong>OpenSky</strong> — authenticated live plane telemetry (higher rate limits).</div>
        </div>
      </HudFrame>
    </div>
  );
}
