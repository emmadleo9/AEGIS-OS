import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HudFrame } from '@/components/hud';
import { api } from '@/lib/api';

type Status = 'offline' | 'connecting' | 'waiting_qr' | 'reconnecting' | 'online' | 'error';
type WaStatus = { status: Status; qr: string | null; user: { id?: string; name?: string } | null; lastError: string | null; pairingCode?: string | null; historySyncStatus?: string };
type ChatEntry = { jid: string; name: string; lastMessage?: string | null; lastMessageAt?: string | null; category?: 'chat' | 'group' | 'channel' };
type ChatMessage = {
  id: string;
  fromMe: boolean;
  text: string;
  type: string;
  sender: string;
  at: string;
  mediaId?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  mediaStatus?: string | null;
  mediaError?: string | null;
};

const MESSAGE_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const MAX_WHATSAPP_UPLOAD_BYTES = 2 * 1024 ** 3;

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

function renderMedia(
  message: ChatMessage,
  online: boolean,
  retryingMediaId: string | null,
  onRetry: (message: ChatMessage) => void,
) {
  if (!message.mediaId) return null;
  const mediaUrl = `/api/whatsapp/media/${encodeURIComponent(message.mediaId)}`;

  if (message.mediaStatus !== 'downloaded') {
    const mediaError = message.mediaError?.includes('empty media key')
      ? 'WhatsApp did not provide a decryption key for this attachment.'
      : message.mediaError;
    const status = message.mediaStatus === 'failed'
      ? `Download failed${mediaError ? `: ${mediaError}` : ''}`
      : message.mediaStatus === 'downloading'
        ? 'Downloading media…'
        : 'Media download queued…';
    return (
      <div className="wa-media-status" role={message.mediaStatus === 'failed' ? 'alert' : undefined}>
        <p>{status}</p>
        {message.mediaStatus === 'failed' && (
          <button type="button" onClick={() => onRetry(message)} disabled={!online || retryingMediaId === message.mediaId}>
            {retryingMediaId === message.mediaId ? 'RETRYING…' : 'RETRY FROM WHATSAPP'}
          </button>
        )}
      </div>
    );
  }

  const mimeType = message.mediaMimeType ?? '';
  return (
    <div className="wa-message-media">
      {mimeType.startsWith('image/') && (
        <a href={mediaUrl} target="_blank" rel="noreferrer">
          <img className="wa-media-preview" src={mediaUrl} alt={message.mediaFileName || 'WhatsApp image'} loading="lazy" />
        </a>
      )}
      {mimeType.startsWith('video/') && (
        <video className="wa-media-preview" src={mediaUrl} controls preload="metadata">
          Your browser cannot play this video. Use the download link below.
        </video>
      )}
      {mimeType.startsWith('audio/') && (
        <audio src={mediaUrl} controls preload="metadata">
          Your browser cannot play this audio. Use the download link below.
        </audio>
      )}
      <a className="wa-media-download" href={mediaUrl} download={message.mediaFileName || true}>
        DOWNLOAD {message.mediaFileName || `${message.type.replace(/Message$/, '').toUpperCase()} FILE`}
      </a>
    </div>
  );
}

export function KrynaraWhatsApp() {
  const [status, setStatus] = useState<WaStatus>({ status: 'offline', qr: null, user: null, lastError: null, pairingCode: null });
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [activeJid, setActiveJid] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatFilter, setChatFilter] = useState<'all' | 'chat' | 'group' | 'channel'>('all');
  const [chatSearch, setChatSearch] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [draft, setDraft] = useState('');
  const [linkTab, setLinkTab] = useState<'qr' | 'phone'>('qr');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [actionError, setActionError] = useState('');
  const [retryingMediaId, setRetryingMediaId] = useState<string | null>(null);
  const [showPairing, setShowPairing] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupParticipants, setGroupParticipants] = useState('');
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [callLinkBusy, setCallLinkBusy] = useState(false);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState('');
  const [savingProfileStatus, setSavingProfileStatus] = useState(false);
  const typingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);
  const online = status.status === 'online';
  const visibleChats = useMemo(() => chats.filter((chat) => {
    const category = chat.category ?? (chat.jid.endsWith('@g.us') ? 'group' : chat.jid.endsWith('@newsletter') ? 'channel' : 'chat');
    return (chatFilter === 'all' || category === chatFilter)
      && `${chat.name} ${chat.jid} ${chat.lastMessage ?? ''}`.toLowerCase().includes(chatSearch.toLowerCase());
  }), [chatFilter, chatSearch, chats]);
  const visibleMessages = useMemo(() => {
    const query = messageSearch.trim().toLowerCase();
    return query ? messages.filter((message) => message.text.toLowerCase().includes(query)) : messages;
  }, [messageSearch, messages]);

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
      const response = await api.get<{ messages: ChatMessage[]; hasOlder: boolean }>(
        `/whatsapp/messages/${encodeURIComponent(activeJid)}`,
        { params: messageSearch ? { search: messageSearch } : undefined },
      );
      setMessages(response.data.messages);
      setHasOlderMessages(response.data.hasOlder);
      setActionError('');
    } catch (error) {
      setActionError(`Could not load WhatsApp messages: ${getErrorMessage(error)}`);
    }
  }, [activeJid, messageSearch]);

  const loadOlderMessages = async () => {
    const before = messages[0]?.at;
    if (!activeJid || !before) return;
    try {
      const response = await api.get<{ messages: ChatMessage[]; hasOlder: boolean }>(
        `/whatsapp/messages/${encodeURIComponent(activeJid)}`,
        { params: { before, beforeId: messages[0]?.id, ...(messageSearch ? { search: messageSearch } : {}) } },
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
  }, [activeJid, messageSearch, refreshMessages]);

  useEffect(() => {
    setReplyTo(null);
    setMessageSearch('');
    setRemoteTyping(false);
    typingActive.current = false;
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
  }, [activeJid]);

  useEffect(() => {
    if (!activeJid || !online) return;
    let alive = true;
    const pollPresence = async () => {
      try {
        const response = await api.get<{ presences: { lastKnownPresence: string }[] }>(
          `/whatsapp/presence/${encodeURIComponent(activeJid)}`,
        );
        if (alive) setRemoteTyping(response.data.presences.some((presence) => presence.lastKnownPresence === 'composing'));
      } catch (error) {
        if (alive) setActionError(`Could not load WhatsApp presence: ${getErrorMessage(error)}`);
      }
    };
    void pollPresence();
    const timer = window.setInterval(() => void pollPresence(), 2500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [activeJid, online]);

  useEffect(() => () => {
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    if (typingActive.current && activeJid) {
      void api.post('/whatsapp/typing', { jid: activeJid, typing: false }).catch((error: unknown) => {
        console.error('Could not clear WhatsApp typing state:', getErrorMessage(error));
      });
    }
  }, [activeJid]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeJid) return;
    try {
      await api.post('/whatsapp/send', { jid: activeJid, text, replyToMessageId: replyTo?.id });
      await refreshMessages();
      setDraft('');
      setReplyTo(null);
      setActionError('');
    } catch (error) {
      setActionError(`Could not send message: ${getErrorMessage(error)}`);
    }
  };

  const updateDraft = (value: string) => {
    setDraft(value);
    if (!activeJid || !online) return;
    if (!typingActive.current) {
      typingActive.current = true;
      void api.post('/whatsapp/typing', { jid: activeJid, typing: true }).catch((error: unknown) => {
        setActionError(`Could not update typing state: ${getErrorMessage(error)}`);
      });
    }
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      typingActive.current = false;
      void api.post('/whatsapp/typing', { jid: activeJid, typing: false }).catch((error: unknown) => {
        setActionError(`Could not stop typing indicator: ${getErrorMessage(error)}`);
      });
    }, 1200);
  };

  const sendMedia = async (file: File) => {
    if (!activeJid) return;
    if (file.size > MAX_WHATSAPP_UPLOAD_BYTES) {
      setActionError('WhatsApp attachments are limited to 2 GB.');
      return;
    }
    setSendingMedia(true);
    try {
      await api.post(
        `/whatsapp/send-media/${encodeURIComponent(activeJid)}`,
        file,
        {
          params: { fileName: file.name, ...(replyTo ? { replyToMessageId: replyTo.id } : {}) },
          headers: { 'Content-Type': 'application/octet-stream', 'X-Media-Mime-Type': file.type || 'application/octet-stream' },
          timeout: 0,
        },
      );
      await refreshMessages();
      setReplyTo(null);
      setActionError('');
    } catch (error) {
      setActionError(`Could not send attachment: ${getErrorMessage(error)}`);
    } finally {
      setSendingMedia(false);
    }
  };

  const createGroup = async () => {
    const phoneNumbers = groupParticipants.split(/[,\n;]/).map((value) => value.trim()).filter(Boolean);
    try {
      const response = await api.post<{ jid: string; name: string }>('/whatsapp/groups', { name: groupName, phoneNumbers });
      setChats((current) => [{ jid: response.data.jid, name: response.data.name, category: 'group' }, ...current]);
      setActiveJid(response.data.jid);
      setGroupName('');
      setGroupParticipants('');
      setShowCreateGroup(false);
      setActionError('');
    } catch (error) {
      setActionError(`Could not create WhatsApp group: ${getErrorMessage(error)}`);
    }
  };

  const createCallLink = async (type: 'audio' | 'video') => {
    setCallLinkBusy(true);
    try {
      const response = await api.post<{ link: string }>('/whatsapp/call-link', { type });
      await navigator.clipboard.writeText(response.data.link);
      setActionError(`${type === 'audio' ? 'VOICE' : 'VIDEO'} call link copied. Share it with the people you want to invite.`);
    } catch (error) {
      setActionError(`Could not create WhatsApp call link: ${getErrorMessage(error)}`);
    } finally {
      setCallLinkBusy(false);
    }
  };

  const saveProfileStatus = async () => {
    setSavingProfileStatus(true);
    try {
      await api.post('/whatsapp/profile-status', { text: profileStatus });
      setActionError('WhatsApp About updated.');
    } catch (error) {
      setActionError(`Could not update WhatsApp About: ${getErrorMessage(error)}`);
    } finally {
      setSavingProfileStatus(false);
    }
  };

  const reactToMessage = async (message: ChatMessage, reaction: string) => {
    try {
      await api.post('/whatsapp/react', { jid: activeJid, messageId: message.id, reaction });
      setReactionMessageId(null);
      setActionError('');
    } catch (error) {
      setActionError(`Could not react to message: ${getErrorMessage(error)}`);
    }
  };

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setActionError('');
    } catch (error) {
      setActionError(`Could not copy message: ${getErrorMessage(error)}`);
    }
  };

  const forwardMessage = async (message: ChatMessage) => {
    const recipient = window.prompt('Forward to a WhatsApp phone number (country code + number) or chat address:');
    if (!recipient?.trim()) return;
    try {
      await api.post('/whatsapp/forward', { jid: activeJid, messageId: message.id, toJid: recipient.trim() });
      setActionError('');
    } catch (error) {
      setActionError(`Could not forward message: ${getErrorMessage(error)}`);
    }
  };

  const deleteMessage = async (message: ChatMessage, scope: 'local' | 'everyone') => {
    const confirmation = scope === 'everyone'
      ? 'Delete this message for everyone? WhatsApp may restrict this by message age.'
      : 'Delete this message from the KRYNARA local archive only?';
    if (!window.confirm(confirmation)) return;
    try {
      await api.post('/whatsapp/delete', { jid: activeJid, messageId: message.id, scope });
      await refreshMessages();
      setActionError('');
    } catch (error) {
      setActionError(`Could not delete message: ${getErrorMessage(error)}`);
    }
  };

  const retryMedia = async (message: ChatMessage) => {
    if (!message.mediaId) return;
    setRetryingMediaId(message.mediaId);
    try {
      const response = await api.post<{ status: string; message?: string }>(
        `/whatsapp/media/${encodeURIComponent(message.mediaId)}/retry`,
      );
      await refreshMessages();
      setActionError(response.data.message ?? '');
    } catch (error) {
      const messageError = getErrorMessage(error);
      setMessages((current) => current.map((item) => item.mediaId === message.mediaId
        ? { ...item, mediaError: messageError }
        : item));
      setActionError(`Could not recover WhatsApp media: ${messageError}`);
    } finally {
      setRetryingMediaId(null);
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
      <HudFrame title="KRYNARA WHATSAPP // CHATS" className="social-chat-list">
        <div className="wa-status">
          <span className={`status-dot${online ? ' online' : ''}`} />
          {STATUS_LABEL[status.status]}
        </div>
        <div className="wa-chat-list">
          {online && <button type="button" className="hud-button wa-create-group" onClick={() => setShowCreateGroup((value) => !value)}>NEW GROUP</button>}
          {showCreateGroup && (
            <div className="wa-group-create">
              <input aria-label="Group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" maxLength={100} />
              <textarea aria-label="Group participant phone numbers" value={groupParticipants} onChange={(event) => setGroupParticipants(event.target.value)} placeholder="Participant phone numbers with country codes, separated by commas" rows={3} />
              <button type="button" className="hud-button" onClick={() => void createGroup()}>CREATE GROUP</button>
            </div>
          )}
          {online && chats.length === 0 && <p className="inline-status">Loading chat list from session…</p>}
          <label className="wa-chat-search">
            <span className="sr-only">Search WhatsApp chats</span>
            <input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats…" />
          </label>
          <div className="wa-chat-filters" role="group" aria-label="Filter chats">
            {(['all', 'chat', 'group', 'channel'] as const).map((filter) => (
              <button key={filter} type="button" className={`device-tab${chatFilter === filter ? ' active' : ''}`} onClick={() => setChatFilter(filter)}>
                {filter === 'chat' ? 'CHATS' : filter === 'all' ? 'ALL' : `${filter.toUpperCase()}S`}
              </button>
            ))}
          </div>
          {visibleChats.map((chat) => (
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
          {online && visibleChats.length === 0 && <p className="inline-status">No chats match this filter.</p>}
          {!online && <p className="inline-status">Pair KRYNARA WhatsApp to see your chats.</p>}
        </div>
      </HudFrame>

      <HudFrame title={activeJid ? formatJid(activeJid) : 'KRYNARA WHATSAPP'} className="social-chat wa-center">
        {!online && (!activeJid || showPairing) && (
          <div className="wa-qr-panel">
            <div className="wa-link-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={linkTab === 'qr'} className={linkTab === 'qr' ? 'device-tab active' : 'device-tab'} onClick={() => setLinkTab('qr')}>QR CODE</button>
              <button type="button" role="tab" aria-selected={linkTab === 'phone'} className={linkTab === 'phone' ? 'device-tab active' : 'device-tab'} onClick={() => setLinkTab('phone')}>LINK WITH PHONE NUMBER</button>
            </div>
            {linkTab === 'qr' && (
              <div className="wa-qr-box">
                {status.qr
                  ? <img src={status.qr} alt="KRYNARA WhatsApp pairing QR" />
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
            <p className="credential-notice">Scan from WhatsApp → Linked devices. Approve history sync on your phone if prompted. Chats, messages, and available media are stored locally.</p>
          </div>
        )}
        {(online || (activeJid && !showPairing)) && (
          <>
            <div className="chat-messages" aria-live="polite">
              <div className="wa-message-search">
                <input aria-label="Search messages in this chat" value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Search messages in this chat…" />
              </div>
              {hasOlderMessages && <button type="button" className="device-tab" onClick={() => void loadOlderMessages()}>LOAD OLDER MESSAGES</button>}
              {remoteTyping && <p className="wa-typing-indicator" aria-live="polite">CONTACT IS TYPING…</p>}
              {visibleMessages.map((message, index) => (
                <div key={message.id || `${message.at}-${index}`} className={message.fromMe ? 'chat-bubble outgoing' : 'chat-bubble'}>
                  <div>{message.text || (message.mediaId ? '' : `(${message.type} message)`)}</div>
                  {renderMedia(message, online, retryingMediaId, retryMedia)}
                  <time>{message.fromMe ? 'YOU' : message.sender || 'THEM'} · {new Date(message.at).toLocaleString()}</time>
                  <div className="wa-message-actions" aria-label="Message actions">
                    <button type="button" onClick={() => void copyMessage(message)} disabled={!message.text}>COPY</button>
                    <button type="button" onClick={() => setReplyTo(message)} disabled={!online}>REPLY</button>
                    <button type="button" onClick={() => void forwardMessage(message)} disabled={!online}>FORWARD</button>
                    <button type="button" onClick={() => setReactionMessageId((current) => current === message.id ? null : message.id)} disabled={!online} aria-label="Choose a reaction">REACT</button>
                    <button type="button" onClick={() => void deleteMessage(message, 'local')}>DELETE LOCAL</button>
                    {message.fromMe && <button type="button" onClick={() => void deleteMessage(message, 'everyone')} disabled={!online}>DELETE FOR EVERYONE</button>}
                  </div>
                  {reactionMessageId === message.id && (
                    <div className="wa-reaction-picker" role="group" aria-label="Message reactions">
                      {MESSAGE_REACTIONS.map((reaction) => <button key={reaction} type="button" onClick={() => void reactToMessage(message, reaction)}>{reaction}</button>)}
                    </div>
                  )}
                </div>
              ))}
              {visibleMessages.length === 0 && <p className="inline-status">{messages.length ? 'No messages match your search.' : online ? 'No stored messages for this chat yet.' : 'No locally stored messages for this chat yet.'}</p>}
            </div>
            {online
              ? <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
                  <div className="wa-compose-controls">
                    {replyTo && <div className="wa-reply-context">Replying to {replyTo.sender || (replyTo.fromMe ? 'you' : 'contact')}: {replyTo.text || `(${replyTo.type})`} <button type="button" onClick={() => setReplyTo(null)}>CANCEL</button></div>}
                    <input aria-label="WhatsApp message" value={draft} onChange={(event) => updateDraft(event.target.value)} placeholder={`Message ${activeJid ? formatJid(activeJid) : ''}…`} />
                  </div>
                  <div className="wa-compose-extras">
                    <button type="button" className="device-tab" onClick={() => setShowEmojiPicker((value) => !value)} aria-expanded={showEmojiPicker}>EMOJI</button>
                    <label className={`device-tab${sendingMedia ? ' disabled' : ''}`}>
                      {sendingMedia ? 'UPLOADING…' : 'ATTACH'}
                      <input type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" disabled={sendingMedia} onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void sendMedia(file);
                        event.currentTarget.value = '';
                      }} />
                    </label>
                  </div>
                  {showEmojiPicker && <div className="wa-emoji-picker" role="group" aria-label="Emoji picker">{['😀', '😂', '😊', '😍', '👍', '❤️', '🙏', '🎉', '😢', '🔥', '✅', '👋'].map((emoji) => <button key={emoji} type="button" onClick={() => updateDraft(`${draft}${emoji}`)}>{emoji}</button>)}</div>}
                  <button className="hud-button" type="submit" disabled={!activeJid}>SEND</button>
                </form>
              : <p className="inline-status">LOCAL ARCHIVE · reconnect to WhatsApp to send messages</p>}
          </>
        )}
      </HudFrame>

      <HudFrame title="KRYNARA WHATSAPP // SESSION" className="social-settings">
        <div className="wa-status">
          <span className={`status-dot${online ? ' online' : ''}`} />
          {STATUS_LABEL[status.status]}
        </div>
        {online && status.user?.id && <p className="credential-notice">Linked as {status.user.id}</p>}
        <div className="wa-call-actions" title="Creates a WhatsApp call link; share it with participants to join.">
          <button type="button" className="hud-button" onClick={() => void createCallLink('audio')} disabled={!online || callLinkBusy}>CREATE VOICE CALL LINK</button>
          <button type="button" className="hud-button" onClick={() => void createCallLink('video')} disabled={!online || callLinkBusy}>CREATE VIDEO CALL LINK</button>
        </div>
        <div className="wa-profile-status">
          <label htmlFor="wa-profile-status">WHATSAPP ABOUT</label>
          <textarea id="wa-profile-status" value={profileStatus} maxLength={139} onChange={(event) => setProfileStatus(event.target.value)} placeholder="Set your WhatsApp About…" />
          <button type="button" className="hud-button" onClick={() => void saveProfileStatus()} disabled={!online || savingProfileStatus}>
            {savingProfileStatus ? 'SAVING…' : 'UPDATE ABOUT'}
          </button>
        </div>
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
        <p className="credential-notice">WhatsApp chat history and available media are stored locally in the KRYNARA database and remain after logout.</p>
      </HudFrame>
    </div>
  );
}
