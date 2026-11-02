import { useCallback, useEffect, useRef, useState } from 'react';
import { HudFrame } from '@/components/hud';
import { loadMemory, saveMemory } from '@/lib/aegis-memory';

type Status = 'offline' | 'connecting' | 'waiting_qr' | 'reconnecting' | 'online' | 'error';
type WaStatus = { status: Status; qr: string | null; user: { id?: string; name?: string } | null; lastError: string | null };
type ChatEntry = { jid: string; name: string };
type ChatMessage = { fromMe: boolean; text: string; at: string };

const STATUS_LABEL: Record<Status, string> = {
  offline: 'OFFLINE',
  connecting: 'CONNECTING…',
  waiting_qr: 'SCAN QR WITH PHONE',
  reconnecting: 'RECONNECTING…',
  online: 'ONLINE',
  error: 'ERROR',
};

function formatJid(jid: string): string {
  return jid.replace(/@.*$/, '').replace(/(\d{3})(?=\d)/g, '$1 ');
}

export function AegisWhatsApp() {
  const [status, setStatus] = useState<WaStatus>({ status: 'offline', qr: null, user: null, lastError: null });
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [activeJid, setActiveJid] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const online = status.status === 'online';

  const refreshChats = useCallback(async () => {
    if (!online) return;
    const stored = await loadMemory<ChatEntry[]>('whatsappAuth', []);
    try {
      const response = await fetch('/api/whatsapp/chats');
      if (response.ok) {
        const data = await response.json() as { chats?: ChatEntry[] };
        if (data.chats?.length) {
          setChats(data.chats.slice(0, 60));
          await saveMemory('whatsappAuth', data.chats.slice(0, 60));
          return;
        }
      }
    } catch {
      /* fall through to cached chats */
    }
    if (stored.length) setChats(stored);
  }, [online]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch('/api/whatsapp/status', { cache: 'no-store' });
        const data = await response.json() as WaStatus;
        if (alive) setStatus(data);
      } catch {
        if (alive) setStatus((current) => ({ ...current, status: 'offline', lastError: 'Gateway unreachable' }));
      }
    };
    void poll();
    const timer = window.setInterval(poll, 4000);
    try {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/whatsapp`);
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as { event: string; payload: unknown };
          if (parsed.event === 'status') setStatus(parsed.payload as WaStatus);
        } catch { /* ignore malformed frames */ }
      };
      wsRef.current = ws;
    } catch {
      /* WebSocket optional — polling covers it */
    }
    return () => {
      alive = false;
      window.clearInterval(timer);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (online) void fetch('/api/whatsapp/start').catch(() => undefined);
  }, [online]);

  useEffect(() => { void refreshChats(); }, [refreshChats]);

  useEffect(() => {
    if (!activeJid) return;
    void (async () => {
      try {
        const response = await fetch(`/api/whatsapp/messages/${encodeURIComponent(activeJid)}`);
        if (response.ok) {
          const data = await response.json() as { messages?: ChatMessage[] };
          setMessages(data.messages ?? []);
        }
      } catch {
        setMessages([]);
      }
    })();
  }, [activeJid]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeJid) return;
    setDraft('');
    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: activeJid, text }),
      });
      setMessages((current) => [...current, { fromMe: true, text, at: new Date().toISOString() }]);
    } catch {
      /* gateway will surface errors via status */
    }
  };

  const logout = async () => {
    await fetch('/api/whatsapp/logout', { method: 'POST' }).catch(() => undefined);
    setStatus({ status: 'offline', qr: null, user: null, lastError: null });
    setChats([]);
  };

  return (
    <div className="social-workspace wa-page">
      <HudFrame title="AEGIS WHATSAPP // CHATS" className="social-chat-list">
        <div className="wa-status">
          <span className={`status-dot${online ? ' online' : ''}`} />
          {STATUS_LABEL[status.status]}
        </div>
        <div className="wa-chat-list">
          {online && chats.length === 0 && <p className="inline-status">Loading chat list from session…</p>}
          {chats.map((chat) => (
            <button
              type="button"
              key={chat.jid}
              className={`wa-chat-item${chat.jid === activeJid ? ' selected' : ''}`}
              onClick={() => setActiveJid(chat.jid)}
            >
              <span className="wa-chat-name">{chat.name || formatJid(chat.jid)}</span>
              <span className="wa-chat-preview">{chat.jid.endsWith('@g.us') ? 'GROUP' : 'DIRECT'}</span>
            </button>
          ))}
          {!online && <p className="inline-status">Pair AEGIS WhatsApp to see your chats.</p>}
        </div>
      </HudFrame>

      <HudFrame title={activeJid ? formatJid(activeJid) : 'AEGIS WHATSAPP'} className="social-chat">
        {!online && (
          <div className="wa-qr-panel">
            {status.qr
              ? <img src={status.qr} alt="AEGIS WhatsApp pairing QR" />
              : <p className="inline-status">{STATUS_LABEL[status.status]} — waiting for QR from gateway…</p>}
            <p className="credential-notice">Open WhatsApp on your phone → Linked devices → Link a device, then scan this code. The session persists across restarts.</p>
          </div>
        )}
        {online && (
          <>
            <div className="chat-messages" aria-live="polite">
              {messages.map((message, index) => (
                <div key={index} className={message.fromMe ? 'chat-bubble outgoing' : 'chat-bubble'}>
                  <div>{message.text || '(media message)'}</div>
                  <time>{message.fromMe ? 'YOU' : 'THEM'} · {new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
              ))}
              {messages.length === 0 && <p className="inline-status">No messages routed for this chat yet.</p>}
            </div>
            <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <input aria-label="WhatsApp message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${activeJid ? formatJid(activeJid) : ''}…`} />
              <button className="hud-button" type="submit" disabled={!activeJid}>SEND</button>
            </form>
          </>
        )}
      </HudFrame>

      <HudFrame title="AEGIS WHATSAPP // SESSION" className="social-settings">
        <div className="wa-status">
          <span className={`status-dot${online ? ' online' : ''}`} />
          {STATUS_LABEL[status.status]}
        </div>
        {status.user?.id && <p className="credential-notice">Linked as {status.user.id}</p>}
        {status.lastError && <p className="credential-notice" style={{ color: '#ff8792' }}>{status.lastError}</p>}
        <button type="button" className="hud-button" onClick={() => void fetch('/api/whatsapp/start', { method: 'POST' })}>
          {online ? 'RECONNECT' : 'START SESSION'}
        </button>
        <button type="button" className="hud-button" onClick={() => void logout()} disabled={!status.user && status.status === 'offline'}>
          LOG OUT
        </button>
        <p className="credential-notice">Auth material is stored only in the gateway data directory — never uploaded. Session survives gateway restarts.</p>
      </HudFrame>
    </div>
  );
}
