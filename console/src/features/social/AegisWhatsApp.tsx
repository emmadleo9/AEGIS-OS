import { useCallback, useEffect, useRef, useState } from 'react';
import { HudFrame } from '@/components/hud';
import { loadMemory, saveMemory } from '@/lib/aegis-memory';
import { api } from '@/lib/api';

type Status = 'offline' | 'connecting' | 'waiting_qr' | 'reconnecting' | 'online' | 'error';
type WaStatus = { status: Status; qr: string | null; user: { id?: string; name?: string } | null; lastError: string | null; pairingCode?: string | null };
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

const API_KEY = localStorage.getItem('aegis-api-key') || 'aegis_master_key';

export function AegisWhatsApp() {
  const [status, setStatus] = useState<WaStatus>({ status: 'offline', qr: null, user: null, lastError: null, pairingCode: null });
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [activeJid, setActiveJid] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [linkTab, setLinkTab] = useState<'qr' | 'phone'>('qr');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const online = status.status === 'online';

  const headers = { 'X-API-Key': API_KEY };

  const refreshChats = useCallback(async () => {
    if (!online) return;
    const stored = await loadMemory<ChatEntry[]>('whatsappAuth', []);
    try {
      const response = await api.get('/sessions/aegis-whatsapp-session/chats', { headers });
      const data = response.data as { chats?: ChatEntry[] } | ChatEntry[];
      const list = Array.isArray(data) ? data : data.chats ?? [];
      if (list.length) {
        setChats(list.slice(0, 60));
        await saveMemory('whatsappAuth', list.slice(0, 60));
        return;
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
        const response = await api.get('/sessions/aegis-whatsapp-session', { headers });
        const data = response.data;
        const st = data.status?.toLowerCase() || 'offline';
        const mapped: Status = st === 'connected' ? 'online' : st === 'connecting' ? 'connecting' : st === 'qr_ready' || st === 'waiting_qr' ? 'waiting_qr' : 'offline';
        if (alive) setStatus((current) => ({ ...current, status: mapped, lastError: null }));
        if (data.qrCode && alive) setStatus((current) => ({ ...current, qr: data.qrCode }));
      } catch {
        if (alive) setStatus((current) => ({ ...current, status: 'offline', lastError: 'Gateway unreachable' }));
      }
    };
    void poll();
    const timer = window.setInterval(poll, 4000);
    try {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events`);
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
    if (online) void api.post('/sessions/aegis-whatsapp-session/start', {}, { headers }).catch(() => undefined);
  }, [online]);

  useEffect(() => { void refreshChats(); }, [refreshChats]);

  useEffect(() => {
    if (!activeJid) return;
    void (async () => {
      try {
        const response = await api.get(`/sessions/aegis-whatsapp-session/messages?chatId=${encodeURIComponent(activeJid)}`, { headers });
        const data = response.data as { messages?: ChatMessage[] } | ChatMessage[];
        const list = Array.isArray(data) ? data : data.messages ?? [];
        setMessages(list.map((m: any) => ({ fromMe: m.fromMe || m.outgoing, text: m.body || m.text || '(media message)', at: m.timestamp || m.at || new Date().toISOString() })));
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
      await api.post('/sessions/aegis-whatsapp-session/messages/send-text', { chatId: activeJid, text }, { headers });
      setMessages((current) => [...current, { fromMe: true, text, at: new Date().toISOString() }]);
    } catch {
      /* gateway will surface errors via status */
    }
  };

  const logout = async () => {
    await api.post(`/sessions/aegis-whatsapp-session/logout`, {}, { headers }).catch(() => undefined);
    setStatus({ status: 'offline', qr: null, user: null, lastError: null, pairingCode: null });
    setPairingCode('');
    setChats([]);
  };

  const requestPairingCode = async () => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 8) {
      setPairingCode('');
      return;
    }
    setPairingBusy(true);
    try {
      await api.post('/sessions/aegis-whatsapp-session/start', {}, { headers });
      const response = await api.post('/sessions/aegis-whatsapp-session/pairing-code', { phoneNumber: digits }, { headers });
      const data = response.data as { code?: string; error?: string };
      setPairingCode(data.code ?? data.error ?? 'FAILED');
    } catch {
      setPairingCode('FAILED');
    } finally {
      setPairingBusy(false);
    }
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

      <HudFrame title={activeJid ? formatJid(activeJid) : 'AEGIS WHATSAPP'} className="social-chat wa-center">
        {!online && (
          <div className="wa-qr-panel">
            <div className="wa-link-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={linkTab === 'qr'} className={linkTab === 'qr' ? 'device-tab active' : 'device-tab'} onClick={() => setLinkTab('qr')}>QR CODE</button>
              <button type="button" role="tab" aria-selected={linkTab === 'phone'} className={linkTab === 'phone' ? 'device-tab active' : 'device-tab'} onClick={() => setLinkTab('phone')}>LINK WITH PHONE NUMBER</button>
            </div>
            {linkTab === 'qr' && (
              <div className="wa-qr-box">
                {status.qr
                  ? <img src={status.qr} alt="AEGIS WhatsApp pairing QR" />
                  : <div className="wa-qr-waiting"><span className="status-dot" />{STATUS_LABEL[status.status]} — requesting QR…</div>}
              </div>
            )}
            {linkTab === 'phone' && (
              <div className="wa-pairing">
                <input
                  aria-label="Phone number"
                  inputMode="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="923001234567 (country code + number, digits only)"
                />
                <button type="button" className="hud-button" onClick={() => void requestPairingCode()} disabled={pairingBusy}>
                  {pairingBusy ? 'REQUESTING…' : 'GET PAIRING CODE'}
                </button>
                {pairingCode && (
                  <div className="wa-pairing-code" aria-live="polite">{pairingCode}</div>
                )}
                <p className="credential-notice">Enter the 8-character code in WhatsApp → Linked devices → Link with phone number instead.</p>
              </div>
            )}
            {status.lastError && <p className="credential-notice" style={{ color: '#ff8792' }}>{status.lastError}</p>}
            <p className="credential-notice">Session persists on Disk D across gateway restarts.</p>
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
        <div className="wa-session-actions">
          <button type="button" className="hud-button" onClick={() => void api.post('/sessions/aegis-whatsapp-session/start', {}, { headers }).catch(() => undefined)} disabled={online}>
            {online ? 'CONNECTED' : 'START SESSION'}
          </button>
          {status.user && (
            <button type="button" className="hud-button" onClick={() => void logout()}>
              LOG OUT
            </button>
          )}
        </div>
        <p className="credential-notice">Auth material is stored only in the gateway data directory — never uploaded. Session survives gateway restarts.</p>
      </HudFrame>
    </div>
  );
}
