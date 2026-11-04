import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { HudFrame } from '@/components/hud';
import { api } from '@/lib/api';

type Status = 'offline' | 'connecting' | 'waiting_qr' | 'reconnecting' | 'online' | 'error';
type WaStatus = { status: Status; qr: string | null; user: { id?: string; name?: string } | null; lastError: string | null; pairingCode?: string | null; historySyncStatus?: string };
type ChatEntry = { jid: string; name: string; lastMessage?: string | null; lastMessageAt?: string | null };
type ChatMessage = { id: string; fromMe: boolean; text: string; type: string; sender: string; at: string };

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

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

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
  const [actionError, setActionError] = useState('');
  const [showPairing, setShowPairing] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const online = status.status === 'online';

  const refreshChats = useCallback(async () => {
    try {
      const response = await api.get<{ chats: ChatEntry[] }>('/whatsapp/chats');
      const list = response.data.chats;
      setChats(list);
      setActiveJid((current) => current || list[0]?.jid || '');
      setActionError('');
    } catch (error) {
      setActionError(`Could not load WhatsApp chats: ${getErrorMessage(error)}`);
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!activeJid) return;
    try {
      const response = await api.get<{ messages: ChatMessage[]; hasOlder: boolean }>(`/whatsapp/messages/${encodeURIComponent(activeJid)}`);
      setMessages(response.data.messages);
      setHasOlderMessages(response.data.hasOlder);
      setActionError('');
    } catch (error) {
      setActionError(`Could not load WhatsApp messages: ${getErrorMessage(error)}`);
    }
  }, [activeJid]);

  const loadOlderMessages = async () => {
    const before = messages[0]?.at;
    if (!activeJid || !before) return;
    try {
      const response = await api.get<{ messages: ChatMessage[]; hasOlder: boolean }>(
        `/whatsapp/messages/${encodeURIComponent(activeJid)}`,
        { params: { before, beforeId: messages[0]?.id } },
      );
      setMessages((current) => [...response.data.messages, ...current]);
      setHasOlderMessages(response.data.hasOlder);
      setActionError('');
    } catch (error) {
      setActionError(`Could not load older messages: ${getErrorMessage(error)}`);
    }
  };

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await api.get<WaStatus>('/whatsapp/status');
        if (alive) {
          setStatus(response.data);
        }
      } catch (error) {
        if (alive) {
          const message = getErrorMessage(error);
          setStatus((current) => ({ ...current, status: 'error', lastError: message }));
        }
      }
    };
    void api.post('/whatsapp/start').then(poll).catch((error: unknown) => {
      if (alive) {
        const message = getErrorMessage(error);
        setStatus((current) => ({ ...current, status: 'error', lastError: message }));
      }
    });
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void refreshChats();
    const timer = window.setInterval(() => void refreshChats(), 15000);
    return () => window.clearInterval(timer);
  }, [refreshChats]);

  useEffect(() => {
    void refreshMessages();
    if (!activeJid) return;
    const timer = window.setInterval(() => void refreshMessages(), 3000);
    return () => window.clearInterval(timer);
  }, [activeJid, refreshMessages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeJid) return;
    try {
      await api.post('/whatsapp/send', { jid: activeJid, text });
      await refreshMessages();
      setDraft('');
      setActionError('');
    } catch (error) {
      setActionError(`Could not send message: ${getErrorMessage(error)}`);
    }
  };

  const logout = async () => {
    try {
      await api.post('/whatsapp/logout');
      setStatus({ status: 'offline', qr: null, user: null, lastError: null, pairingCode: null });
      setPairingCode('');
      setChats([]);
      setActiveJid('');
      setMessages([]);
      setActionError('');
    } catch (error) {
      setActionError(`Could not log out of WhatsApp: ${getErrorMessage(error)}`);
    }
  };

  const requestPairingCode = async () => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 8) {
      setPairingCode('');
      setActionError('Enter the full phone number in international format.');
      return;
    }
    setPairingBusy(true);
    try {
      await api.post('/whatsapp/start');
      const response = await api.post<{ code?: string }>('/whatsapp/pairing-code', { phoneNumber: digits });
      if (!response.data.code) throw new Error('The gateway did not return a pairing code.');
      setPairingCode(response.data.code);
      setActionError('');
    } catch (error) {
      setActionError(`Could not get a pairing code: ${getErrorMessage(error)}`);
    } finally {
      setPairingBusy(false);
    }
  };

  const startSession = async () => {
    try {
      await api.post('/whatsapp/start');
      const response = await api.get<WaStatus>('/whatsapp/status');
      setStatus(response.data);
      setActionError('');
    } catch (error) {
      setActionError(`Could not start WhatsApp: ${getErrorMessage(error)}`);
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
              <span className="wa-chat-preview">{chat.lastMessage || (chat.jid.endsWith('@g.us') ? 'GROUP' : 'DIRECT')}</span>
            </button>
          ))}
          {!online && <p className="inline-status">Pair AEGIS WhatsApp to see your chats.</p>}
        </div>
      </HudFrame>

      <HudFrame title={activeJid ? formatJid(activeJid) : 'AEGIS WHATSAPP'} className="social-chat wa-center">
        {!online && (!activeJid || showPairing) && (
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
            {(actionError || status.lastError) && <p className="wa-error" role="alert">{actionError || status.lastError}</p>}
            <p className="credential-notice">Session persists on Disk D across gateway restarts.</p>
          </div>
        )}
        {(online || (activeJid && !showPairing)) && (
          <>
            <div className="chat-messages" aria-live="polite">
              {hasOlderMessages && <button type="button" className="device-tab" onClick={() => void loadOlderMessages()}>LOAD OLDER MESSAGES</button>}
              {messages.map((message, index) => (
                <div key={message.id || `${message.at}-${index}`} className={message.fromMe ? 'chat-bubble outgoing' : 'chat-bubble'}>
                  <div>{message.text || `(${message.type} message)`}</div>
                  <time>{message.fromMe ? 'YOU' : message.sender || 'THEM'} · {new Date(message.at).toLocaleString()}</time>
                </div>
              ))}
              {messages.length === 0 && <p className="inline-status">{online ? 'No stored messages for this chat yet.' : 'No locally stored messages for this chat yet.'}</p>}
            </div>
            {online
              ? <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
                  <input aria-label="WhatsApp message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${activeJid ? formatJid(activeJid) : ''}…`} />
                  <button className="hud-button" type="submit" disabled={!activeJid}>SEND</button>
                </form>
              : <p className="inline-status">LOCAL ARCHIVE · reconnect to WhatsApp to send messages</p>}
          </>
        )}
      </HudFrame>

      <HudFrame title="AEGIS WHATSAPP // SESSION" className="social-settings">
        <div className="wa-status">
          <span className={`status-dot${online ? ' online' : ''}`} />
          {STATUS_LABEL[status.status]}
        </div>
        {online && status.user?.id && <p className="credential-notice">Linked as {status.user.id}</p>}
        {(actionError || status.lastError) && <p className="wa-error" role="alert">{actionError || status.lastError}</p>}
        <div className="wa-session-actions">
          <button type="button" className="hud-button" onClick={() => void startSession()} disabled={online || status.status === 'connecting' || status.status === 'waiting_qr'}>
            {online ? 'CONNECTED' : status.status === 'waiting_qr' ? 'WAITING FOR SCAN' : status.status === 'connecting' ? 'STARTING…' : 'START SESSION'}
          </button>
          {online && status.user && (
            <button type="button" className="hud-button" onClick={() => void logout()}>
              LOG OUT
            </button>
          )}
          {!online && activeJid && (
            <button type="button" className="hud-button" onClick={() => setShowPairing((current) => !current)}>
              {showPairing ? 'VIEW SAVED CHAT' : 'SHOW PAIRING QR'}
            </button>
          )}
        </div>
        {status.historySyncStatus === 'syncing' && <p className="credential-notice">Syncing WhatsApp chat history…</p>}
        {status.historySyncStatus === 'complete' && <p className="credential-notice">WhatsApp history sync complete. Messages are stored locally.</p>}
        <p className="credential-notice">WhatsApp chat history is stored locally in the AEGIS database and remains after logout. Media files are not downloaded.</p>
      </HudFrame>
    </div>
  );
}
