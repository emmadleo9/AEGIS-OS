/**
 * KRYNARA WhatsApp — Baileys-powered WhatsApp integration for the KRYNARA HUD.
 * Auth persists in gateway/data/baileys_auth so sessions survive restarts.
 */
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const QRCode = require('qrcode');
const { getDb } = require('./memory');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadMediaMessage,
  normalizeMessageContent,
  getContentType,
  proto,
  getBinaryNodeChild,
} = require('@whiskeysockets/baileys');

const AUTH_DIR = path.join(__dirname, '..', 'data', 'baileys_auth');
const MEDIA_DIR = path.join(__dirname, '..', 'data', 'whatsapp_media');
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_UPLOAD_BYTES_LABEL = '2 GB';
const MEDIA_TYPES = new Set(['imageMessage', 'videoMessage', 'ptvMessage', 'audioMessage', 'documentMessage', 'stickerMessage']);
const ALLOWED_CHAT_JID = /^[^@\s]{1,160}@(s\.whatsapp\.net|g\.us|lid)$/;
const contactPresence = new Map();
const ownTypingChats = new Map();
const presenceSubscriptions = new Set();

let sock = null;
let startingPromise = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let intentionalLogout = false;
const mediaQueue = [];
const mediaDownloadsInProgress = new Set();
const recoverableMediaMessages = new Map();
const MAX_RECOVERABLE_MEDIA_MESSAGES = 100;
let activeMediaDownloads = 0;
let connectionState = { status: 'offline', qr: null, user: null, lastError: null, pairingCode: null, updatedAt: new Date().toISOString() };
const wsClients = new Set();
let wsBroadcaster = null;

function getWhatsAppStore() {
  const db = getDb();
  return {
    upsertChat: db.prepare(`
      INSERT INTO whatsapp_chats (jid, name, last_message, last_message_at)
      VALUES (@jid, @name, @lastMessage, @lastMessageAt)
      ON CONFLICT(jid) DO UPDATE SET
        name = CASE WHEN excluded.name <> '' AND excluded.name <> excluded.jid THEN excluded.name ELSE whatsapp_chats.name END,
        last_message = CASE
          WHEN excluded.last_message IS NOT NULL
            AND (whatsapp_chats.last_message_at IS NULL OR excluded.last_message_at >= whatsapp_chats.last_message_at)
          THEN excluded.last_message ELSE whatsapp_chats.last_message END,
        last_message_at = CASE
          WHEN excluded.last_message_at IS NOT NULL
            AND (whatsapp_chats.last_message_at IS NULL OR excluded.last_message_at >= whatsapp_chats.last_message_at)
          THEN excluded.last_message_at ELSE whatsapp_chats.last_message_at END,
        updated_at = datetime('now')
    `),
    upsertContact: db.prepare(`
      INSERT INTO whatsapp_contacts (jid, name) VALUES (@jid, @name)
      ON CONFLICT(jid) DO UPDATE SET
        name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE whatsapp_contacts.name END,
        updated_at = datetime('now')
    `),
    saveMessage: db.prepare(`
      INSERT INTO whatsapp_messages (
        message_id, jid, sender, participant, from_me, text, message_type, timestamp,
        message_content, media_id, media_mime_type, media_file_name, media_status
      ) VALUES (
        @messageId, @jid, @sender, @participant, @fromMe, @text, @messageType, @timestamp,
        @messageContent, @mediaId, @mediaMimeType, @mediaFileName, @mediaStatus
      )
      ON CONFLICT(jid, message_id) DO UPDATE SET
        participant = COALESCE(whatsapp_messages.participant, excluded.participant),
        text = CASE WHEN whatsapp_messages.text = '' THEN excluded.text ELSE whatsapp_messages.text END,
        message_type = CASE WHEN whatsapp_messages.message_type = 'unknown' THEN excluded.message_type ELSE whatsapp_messages.message_type END,
        message_content = COALESCE(whatsapp_messages.message_content, excluded.message_content),
        media_id = COALESCE(whatsapp_messages.media_id, excluded.media_id),
        media_mime_type = COALESCE(whatsapp_messages.media_mime_type, excluded.media_mime_type),
        media_file_name = COALESCE(whatsapp_messages.media_file_name, excluded.media_file_name),
        media_status = CASE
          WHEN whatsapp_messages.media_status = 'downloaded' THEN 'downloaded'
          ELSE COALESCE(excluded.media_status, whatsapp_messages.media_status)
        END
    `),
    getMessage: db.prepare(`
      SELECT media_id AS mediaId, media_mime_type AS mediaMimeType,
        media_file_name AS mediaFileName, media_path AS mediaPath, media_status AS mediaStatus
      FROM whatsapp_messages WHERE jid = ? AND message_id = ?
    `),
  };
}

function messageContent(message) {
  let content = normalizeMessageContent(message.message) ?? message.message ?? {};
  let messageType = getContentType(content) ?? Object.keys(content)[0] ?? 'unknown';
  let item = content[messageType] ?? {};
  if (messageType === 'documentWithCaptionMessage' && item.message) {
    content = normalizeMessageContent(item.message) ?? item.message;
    messageType = getContentType(content) ?? Object.keys(content)[0] ?? 'unknown';
    item = content[messageType] ?? {};
  }
  const text = content.conversation
    ?? content.extendedTextMessage?.text
    ?? item.caption
    ?? item.fileName
    ?? item.displayName
    ?? item.text
    ?? item.name
    ?? item.address
    ?? '';
  let messageContent;
  try {
    messageContent = JSON.stringify(message.message ?? null, (key, value) => {
      if (['mediaKey', 'fileSha256', 'fileEncSha256', 'streamingSidecar', 'jpegThumbnail', 'thumbnail'].includes(key)) return undefined;
      if (Array.isArray(value) && value.length > 5000) return undefined;
      return value;
    });
  } catch (error) {
    console.error('[krynara-whatsapp] message content serialization failed:', error);
    messageContent = null;
  }
  const mediaId = MEDIA_TYPES.has(messageType) ? crypto.randomUUID() : null;
  const mediaFileName = item.fileName
    ? String(item.fileName).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180)
    : null;
  return {
    messageType,
    text: String(text),
    messageContent,
    mediaId,
    mediaMimeType: mediaId ? String(item.mimetype ?? (messageType === 'ptvMessage' ? 'video/mp4' : 'application/octet-stream')) : null,
    mediaFileName,
    mediaStatus: mediaId ? 'pending' : null,
  };
}

function persistChat(chat, store = getWhatsAppStore()) {
  if (!chat?.id) return;
  const jid = String(chat.id);
  const timestamp = chat.lastMessageRecvTimestamp == null
    ? null
    : new Date(Number(chat.lastMessageRecvTimestamp) * 1000).toISOString();
  store.upsertChat.run({
    jid,
    name: String(chat.name ?? chat.subject ?? chat.notify ?? chat.verifiedName ?? ''),
    lastMessage: null,
    lastMessageAt: timestamp,
  });
}

function persistContact(contact, store = getWhatsAppStore()) {
  if (!contact?.id) return;
  store.upsertContact.run({
    jid: String(contact.id),
    name: String(contact.name ?? contact.notify ?? contact.verifiedName ?? contact.shortName ?? ''),
  });
}

function persistMessage(message, store = getWhatsAppStore()) {
  const jid = message.key?.remoteJid;
  const messageId = message.key?.id;
  if (!jid || !messageId || jid === 'status@broadcast') return;
  const timestampValue = Number(message.messageTimestamp);
  const timestamp = new Date(Number.isFinite(timestampValue) ? timestampValue * 1000 : Date.now()).toISOString();
  const content = messageContent(message);
  const sender = String(message.pushName ?? message.key.participant ?? '');
  const fromMe = message.key.fromMe ? 1 : 0;
  store.saveMessage.run({
    messageId,
    jid,
    sender,
    participant: message.key.participant ? String(message.key.participant) : null,
    fromMe,
    timestamp,
    ...content,
  });
  const savedMessage = store.getMessage.get(jid, messageId);
  store.upsertChat.run({
    jid,
    name: sender && !fromMe && !jid.endsWith('@g.us') ? sender : '',
    lastMessage: content.text || `[${content.messageType}]`,
    lastMessageAt: timestamp,
  });
  return { jid, messageId, ...savedMessage };
}

function broadcast(event, payload) {
  for (const client of wsClients) {
    try {
      if (client.readyState === 1) client.send(JSON.stringify({ event, payload }));
    } catch {
      wsClients.delete(client);
    }
  }
}

function setState(patch) {
  connectionState = { ...connectionState, ...patch, updatedAt: new Date().toISOString() };
  broadcast('status', connectionState);
  process.stdout.write(`[krynara-whatsapp] setState -> ${connectionState.status}${connectionState.qr ? ' (qr ready)' : ''}\n`);
}

function scheduleReconnect(delay) {
  if (intentionalLogout || reconnectTimer) return;
  const retryDelay = delay ?? Math.min(1000 * (2 ** reconnectAttempts), MAX_RECONNECT_DELAY_MS);
  reconnectAttempts = Math.min(reconnectAttempts + 1, 5);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startKrynaraWhatsApp().catch((error) => {
      console.error('[krynara-whatsapp] automatic reconnect failed:', error);
      setState({ status: 'error', lastError: `WhatsApp reconnect failed: ${error instanceof Error ? error.message : String(error)}` });
    });
  }, retryDelay);
  reconnectTimer.unref?.();
  return retryDelay;
}

function mediaExtension(mediaMimeType, mediaFileName) {
  const requestedExtension = path.extname(mediaFileName ?? '').toLowerCase();
  if (/^\.[a-z0-9]{1,10}$/.test(requestedExtension)) return requestedExtension;
  const mimeType = String(mediaMimeType ?? '').split(';', 1)[0].trim().toLowerCase();
  const extensions = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/ogg': '.ogv',
    'audio/ogg': '.ogg',
    'audio/opus': '.opus',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
    'audio/amr': '.amr',
    'audio/wav': '.wav',
    'audio/webm': '.webm',
    'video/webm': '.webm',
    'video/3gpp': '.3gp',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/json': '.json',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  };
  return extensions[mimeType] ?? '.bin';
}

function normalizeStoredMediaExtensions() {
  const db = getDb();
  const mediaRows = db.prepare(`
    SELECT jid, message_id AS messageId, media_id AS mediaId, media_mime_type AS mediaMimeType,
      media_file_name AS mediaFileName, media_path AS mediaPath
    FROM whatsapp_messages WHERE media_status = 'downloaded' AND media_path IS NOT NULL
  `).all();
  const updatePath = db.prepare('UPDATE whatsapp_messages SET media_path = ? WHERE jid = ? AND message_id = ?');
  for (const media of mediaRows) {
    const storedName = path.basename(media.mediaPath);
    if (storedName !== media.mediaPath || !storedName.startsWith(`${media.mediaId}.`)) {
      console.error(`[krynara-whatsapp] invalid local media path for ${media.jid}/${media.messageId}`);
      continue;
    }
    const extension = mediaExtension(media.mediaMimeType, media.mediaFileName);
    if (path.extname(storedName).toLowerCase() === extension) continue;
    const sourcePath = path.join(MEDIA_DIR, storedName);
    const targetPath = path.join(MEDIA_DIR, `${media.mediaId}${extension}`);
    if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) continue;
    try {
      fs.renameSync(sourcePath, targetPath);
      updatePath.run(path.basename(targetPath), media.jid, media.messageId);
    } catch (error) {
      console.error(`[krynara-whatsapp] could not normalize stored media filename ${storedName}:`, error);
    }
  }
}

async function downloadMedia(message, socket) {
  const jid = message.key?.remoteJid;
  const messageId = message.key?.id;
  if (!jid || !messageId) return;
  let temporaryPath;
  try {
    const db = getDb();
    const media = db.prepare(`
      SELECT media_id AS mediaId, media_mime_type AS mediaMimeType,
        media_file_name AS mediaFileName, media_path AS mediaPath, media_status AS mediaStatus
      FROM whatsapp_messages WHERE jid = ? AND message_id = ?
    `).get(jid, messageId);
    if (!media?.mediaId || media.mediaStatus === 'downloaded') return;

    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const extension = mediaExtension(media.mediaMimeType, media.mediaFileName);
    const storedFileName = `${media.mediaId}${extension}`;
    const finalPath = path.join(MEDIA_DIR, storedFileName);
    temporaryPath = `${finalPath}.part`;
    await fsPromises.rm(temporaryPath, { force: true });
    db.prepare(`
      UPDATE whatsapp_messages SET media_status = 'downloading', media_error = NULL
      WHERE jid = ? AND message_id = ?
    `).run(jid, messageId);

    const stream = await downloadMediaMessage(message, 'stream', {}, {
      logger: socket.logger ?? console,
      reuploadRequest: (updatedMessage) => socket.updateMediaMessage(updatedMessage),
    });
    let mediaBytes = 0;
    const sizeGuard = new Transform({
      transform(chunk, _encoding, callback) {
        mediaBytes += chunk.length;
        if (mediaBytes > MAX_MEDIA_BYTES) {
          callback(new Error(`WhatsApp media exceeds the ${MAX_MEDIA_BYTES / (1024 * 1024)} MB local storage limit.`));
          return;
        }
        callback(null, chunk);
      },
    });
    await pipeline(stream, sizeGuard, fs.createWriteStream(temporaryPath, { flags: 'wx' }));
    await fsPromises.rename(temporaryPath, finalPath);
    temporaryPath = null;
    db.prepare(`
      UPDATE whatsapp_messages SET media_status = 'downloaded', media_path = ?, media_error = NULL
      WHERE jid = ? AND message_id = ?
    `).run(storedFileName, jid, messageId);
    recoverableMediaMessages.delete(`${jid}\u0000${messageId}`);
    broadcast('media', { jid, messageId, mediaId: media.mediaId });
  } catch (error) {
    if (temporaryPath) await fsPromises.rm(temporaryPath, { force: true }).catch((cleanupError) => {
      console.error('[krynara-whatsapp] incomplete media cleanup failed:', cleanupError);
    });
    const messageText = error instanceof Error ? error.message : String(error);
    console.error(`[krynara-whatsapp] media download failed for ${jid}/${messageId}:`, error);
    if (mediaKeyFromMessage(message)) {
      const key = `${jid}\u0000${messageId}`;
      recoverableMediaMessages.delete(key);
      recoverableMediaMessages.set(key, message);
      while (recoverableMediaMessages.size > MAX_RECOVERABLE_MEDIA_MESSAGES) {
        recoverableMediaMessages.delete(recoverableMediaMessages.keys().next().value);
      }
    }
    getDb().prepare(`
      UPDATE whatsapp_messages SET media_status = 'failed', media_error = ?
      WHERE jid = ? AND message_id = ?
    `).run(messageText.slice(0, 500), jid, messageId);
    broadcast('media', { jid, messageId, status: 'failed' });
  }
}

function enqueueMediaDownload(message, socket) {
  const jid = message.key?.remoteJid;
  const messageId = message.key?.id;
  if (!jid || !messageId) return;
  const key = `${jid}\u0000${messageId}`;
  if (mediaDownloadsInProgress.has(key)) return;
  mediaDownloadsInProgress.add(key);
  mediaQueue.push({ message, socket, key });
  processMediaQueue();
}

function findNewsletterMessage(node, jid, messageId) {
  if (!node || typeof node !== 'object') return null;
  if (node.tag === 'message') {
    const nodeId = node.attrs?.message_id ?? node.attrs?.server_id;
    const plaintext = getBinaryNodeChild(node, 'plaintext')?.content;
    if (nodeId === messageId && plaintext) {
      const content = typeof plaintext === 'string'
        ? Buffer.from(plaintext, 'binary')
        : Buffer.from(plaintext);
      const decoded = proto.Message.decode(content).toJSON();
      return proto.WebMessageInfo.fromObject({
        key: { remoteJid: jid, id: nodeId, fromMe: false },
        message: decoded,
        messageTimestamp: Number(node.attrs?.t) || Math.floor(Date.now() / 1000),
      }).toJSON();
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const found = findNewsletterMessage(child, jid, messageId);
      if (found) return found;
    }
  }
  return null;
}

function mediaKeyFromMessage(message) {
  const content = normalizeMessageContent(message?.message) ?? message?.message ?? {};
  const type = getContentType(content);
  const mediaKey = type ? content[type]?.mediaKey : null;
  if (typeof mediaKey === 'string') return mediaKey.length > 0 ? mediaKey : null;
  return mediaKey?.length ? mediaKey : null;
}

function withTimeout(promise, milliseconds, message) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timeout));
}

function processMediaQueue() {
  while (activeMediaDownloads < 3 && mediaQueue.length > 0) {
    const item = mediaQueue.shift();
    activeMediaDownloads += 1;
    void downloadMedia(item.message, item.socket)
      .catch((error) => console.error('[krynara-whatsapp] media queue failed:', error))
      .finally(() => {
        activeMediaDownloads -= 1;
        mediaDownloadsInProgress.delete(item.key);
        processMediaQueue();
      });
  }
}

async function startKrynaraWhatsApp() {
  if (sock) return Promise.resolve();
  if (startingPromise) return startingPromise;
  intentionalLogout = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  startingPromise = (async () => {
    try {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();
      const socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['KRYNARA WhatsApp', 'Chrome', '1.0'],
        syncFullHistory: true,
      });
      sock = socket;

      socket.ev.on('creds.update', (...args) => {
        if (sock === socket) void saveCreds(...args);
      });

      socket.ev.on('messaging-history.set', ({ chats = [], contacts = [], messages = [] }) => {
        if (sock !== socket) return;
        try {
          const store = getWhatsAppStore();
          const saveHistory = getDb().transaction(() => {
            for (const chat of chats) persistChat(chat, store);
            for (const contact of contacts) persistContact(contact, store);
            for (const message of messages) persistMessage(message, store);
          });
          saveHistory();
          for (const message of messages) enqueueMediaDownload(message, socket);
          setState({ historySyncStatus: 'syncing' });
          broadcast('history', { chats: chats.length, contacts: contacts.length, messages: messages.length });
          console.log(`[krynara-whatsapp] saved history batch: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`);
        } catch (error) {
          console.error('[krynara-whatsapp] history persistence failed:', error);
          setState({ historySyncStatus: 'error', lastError: `Could not save WhatsApp history: ${error instanceof Error ? error.message : String(error)}` });
        }
      });

      socket.ev.on('messaging-history.status', ({ status }) => {
        if (sock !== socket) return;
        setState({ historySyncStatus: status });
      });

      socket.ev.on('chats.upsert', (chats) => {
        if (sock !== socket) return;
        try {
          const store = getWhatsAppStore();
          const saveChats = getDb().transaction(() => {
            for (const chat of chats) persistChat(chat, store);
          });
          saveChats();
          broadcast('chats', { count: chats.length });
        } catch (error) {
          console.error('[krynara-whatsapp] chat persistence failed:', error);
          setState({ lastError: `Could not save WhatsApp chats: ${error instanceof Error ? error.message : String(error)}` });
        }
      });

      socket.ev.on('chats.update', (chats) => {
        if (sock !== socket) return;
        try {
          const store = getWhatsAppStore();
          const saveChats = getDb().transaction(() => {
            for (const chat of chats) persistChat(chat, store);
          });
          saveChats();
        } catch (error) {
          console.error('[krynara-whatsapp] chat update persistence failed:', error);
        }
      });

      socket.ev.on('contacts.upsert', (contacts) => {
        if (sock !== socket) return;
        try {
          const store = getWhatsAppStore();
          const saveContacts = getDb().transaction(() => {
            for (const contact of contacts) persistContact(contact, store);
          });
          saveContacts();
        } catch (error) {
          console.error('[krynara-whatsapp] contact persistence failed:', error);
        }
      });

      socket.ev.on('contacts.update', (contacts) => {
        if (sock !== socket) return;
        try {
          const store = getWhatsAppStore();
          const saveContacts = getDb().transaction(() => {
            for (const contact of contacts) persistContact(contact, store);
          });
          saveContacts();
        } catch (error) {
          console.error('[krynara-whatsapp] contact update persistence failed:', error);
        }
      });

      socket.ev.on('presence.update', ({ id, presences = {} }) => {
        if (sock !== socket || !id) return;
        const now = Date.now();
        const updates = Object.entries(presences).map(([participant, presence]) => {
          const value = {
            jid: String(id),
            participant,
            lastKnownPresence: presence.lastKnownPresence ?? 'unavailable',
            lastSeen: presence.lastSeen ?? null,
            updatedAt: now,
          };
          contactPresence.set(`${value.jid}\u0000${participant}`, value);
          return value;
        });
        if (contactPresence.size > 2000) {
          for (const [key, presence] of contactPresence) {
            if (presence.updatedAt < now - 5 * 60 * 1000) contactPresence.delete(key);
          }
        }
        broadcast('presence', { jid: String(id), presences: updates });
      });

      socket.ev.on('connection.update', (update) => {
        if (sock !== socket) return;
        console.log('[krynara-whatsapp] connection.update:', JSON.stringify({ connection: update.connection, qr: Boolean(update.qr) }));
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          QRCode.toDataURL(qr, { margin: 1, width: 512, color: { dark: '#050A0E', light: '#E6FBFF' } })
            .then((qrDataUrl) => {
              if (sock === socket) setState({ status: 'waiting_qr', qr: qrDataUrl, lastError: null });
            })
            .catch((error) => {
              if (sock === socket) setState({ status: 'error', lastError: `QR encode failed: ${error.message}` });
            });
        }
        if (connection === 'connecting') setState({ status: 'connecting', qr: null });
        if (connection === 'open') {
          reconnectAttempts = 0;
          setState({ status: 'online', qr: null, user: socket.user ?? null, lastError: null, historySyncStatus: 'syncing' });
        }
        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.code;
          const codeNumber = Number(code);
          const reason = DisconnectReason[codeNumber] ?? String(code ?? 'unknown');
          sock = null;
          presenceSubscriptions.clear();
          ownTypingChats.clear();
          if (intentionalLogout) {
            setState({ status: 'offline', qr: null, user: null, pairingCode: null, lastError: null });
            return;
          }
          if (codeNumber === DisconnectReason.loggedOut) {
            try {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            } catch (error) {
              setState({
                status: 'error',
                qr: null,
                user: null,
                lastError: `WhatsApp logged out (${reason}); could not clear the expired local session: ${error instanceof Error ? error.message : String(error)}`,
              });
              return;
            }
            const retryDelay = scheduleReconnect(500);
            setState({ status: 'reconnecting', qr: null, user: null, lastError: `WhatsApp logged out. Preparing a fresh pairing QR in ${retryDelay / 1000}s.` });
          } else if (codeNumber === DisconnectReason.connectionReplaced) {
            setState({
              status: 'error',
              qr: null,
              lastError: 'WhatsApp replaced this connection because another client is using the same linked-device session. Remove the old KRYNARA entry from WhatsApp → Linked devices, then start again.',
            });
          } else {
            const retryDelay = scheduleReconnect();
            setState({ status: 'reconnecting', qr: null, lastError: `Disconnected (${reason}). Retrying in ${Math.ceil(retryDelay / 1000)}s.` });
          }
        }
      });

      socket.ev.on('messages.upsert', ({ messages = [] }) => {
        if (sock !== socket) return;
        try {
          const store = getWhatsAppStore();
          const saveMessages = getDb().transaction(() => {
            for (const message of messages) persistMessage(message, store);
          });
          saveMessages();
          for (const message of messages) enqueueMediaDownload(message, socket);
          broadcast('messages', { jid: messages[0]?.key?.remoteJid, count: messages.length });
        } catch (error) {
          console.error('[krynara-whatsapp] message persistence failed:', error);
          setState({ lastError: `Could not save WhatsApp messages: ${error instanceof Error ? error.message : String(error)}` });
        }
      });
      setState({ status: 'connecting', qr: null, lastError: null });
      console.log('[krynara-whatsapp] socket wired, auth dir:', AUTH_DIR);
    } catch (error) {
      sock = null;
      setState({ status: 'error', lastError: error instanceof Error ? error.message : String(error) });
      console.error('[krynara-whatsapp] start failed:', error);
    } finally {
      startingPromise = null;
    }
  })();
  return startingPromise;
}

function registerKrynaraWhatsApp(app, { broadcastStatus } = {}) {
  if (broadcastStatus) wsBroadcaster = broadcastStatus;
  normalizeStoredMediaExtensions();

  app.get('/api/whatsapp/status', (_req, res) => res.json(connectionState));

  app.post('/api/whatsapp/start', async (_req, res) => {
    if (connectionState.status === 'online') return res.json(connectionState);
    await startKrynaraWhatsApp();
    res.json(connectionState);
  });

  app.get('/api/whatsapp/qr', (_req, res) => {
    if (connectionState.status === 'online') return res.json({ qr: null, status: connectionState.status, user: connectionState.user });
    if (!sock) void startKrynaraWhatsApp();
    // give the socket a moment to emit a QR if this is a cold start
    const wait = new Promise((resolve) => setTimeout(resolve, 2500));
    void wait.then(() => res.json({ qr: connectionState.qr, status: connectionState.status, user: connectionState.user }));
  });

  app.get('/api/whatsapp/chats', (_req, res) => {
    try {
      const chats = getDb().prepare(`
        SELECT chats.jid,
          COALESCE(NULLIF(chats.name, ''), NULLIF(contacts.name, ''),
            CASE WHEN instr(chats.jid, '@') > 0 THEN substr(chats.jid, 1, instr(chats.jid, '@') - 1) ELSE chats.jid END) AS name,
          chats.last_message AS lastMessage,
          chats.last_message_at AS lastMessageAt,
          CASE
            WHEN chats.jid LIKE '%@newsletter' THEN 'channel'
            WHEN chats.jid LIKE '%@g.us' THEN 'group'
            ELSE 'chat'
          END AS category
        FROM whatsapp_chats AS chats
        LEFT JOIN whatsapp_contacts AS contacts ON contacts.jid = chats.jid
        ORDER BY COALESCE(chats.last_message_at, chats.updated_at) DESC, name COLLATE NOCASE
        LIMIT 500
      `).all();
      res.json({ chats, source: 'local-sqlite', connected: connectionState.status === 'online' });
    } catch (error) {
      res.status(500).json({ error: `Could not load stored WhatsApp chats: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.get('/api/whatsapp/contacts', (_req, res) => {
    try {
      const contacts = getDb().prepare(`
        SELECT jid, name FROM whatsapp_contacts
        WHERE jid LIKE '%@s.whatsapp.net' OR jid LIKE '%@lid'
        ORDER BY name COLLATE NOCASE LIMIT 1000
      `).all();
      res.json({ contacts });
    } catch (error) {
      res.status(500).json({ error: `Could not load WhatsApp contacts: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.get('/api/whatsapp/presence/:jid', (req, res) => {
    const jid = String(req.params.jid);
    if (!ALLOWED_CHAT_JID.test(jid)) return res.status(400).json({ error: 'A valid WhatsApp chat address is required.' });
    const socket = sock;
    if (socket && !presenceSubscriptions.has(jid)) {
      presenceSubscriptions.add(jid);
      void socket.presenceSubscribe(jid).catch((error) => {
        presenceSubscriptions.delete(jid);
        console.error(`[krynara-whatsapp] presence subscription failed for ${jid}:`, error);
      });
    }
    const now = Date.now();
    const presences = [...contactPresence.values()]
      .filter((presence) => presence.jid === jid && now - presence.updatedAt < 60000)
      .map(({ participant, lastKnownPresence, lastSeen }) => ({ participant, lastKnownPresence, lastSeen }));
    res.json({
      presences,
      typing: ownTypingChats.get(jid) ?? false,
    });
  });

  app.post('/api/whatsapp/typing', async (req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
    const { jid, typing } = req.body ?? {};
    if (typeof jid !== 'string' || !ALLOWED_CHAT_JID.test(jid) || typeof typing !== 'boolean') {
      return res.status(400).json({ error: 'A valid chat address and typing state are required.' });
    }
    try {
      const socket = sock;
      ownTypingChats.set(jid, typing);
      await socket.sendPresenceUpdate(typing ? 'composing' : 'paused', jid);
      res.json({ updated: true });
    } catch (error) {
      res.status(502).json({ error: `Could not update WhatsApp typing state: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post('/api/whatsapp/groups', async (req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const phoneNumbers = req.body?.phoneNumbers;
    if (!name || name.length > 100 || !Array.isArray(phoneNumbers) || phoneNumbers.length < 1 || phoneNumbers.length > 255) {
      return res.status(400).json({ error: 'A group name and 1 to 255 participant phone numbers are required.' });
    }
    const participants = [...new Set(phoneNumbers.map((phone) => String(phone).replace(/\D/g, '')))];
    if (participants.some((phone) => phone.length < 8 || phone.length > 15)) {
      return res.status(400).json({ error: 'Each participant must be a valid international phone number.' });
    }
    try {
      const socket = sock;
      const group = await socket.groupCreate(name, participants.map((phone) => `${phone}@s.whatsapp.net`));
      if (sock !== socket) return res.status(409).json({ error: 'WhatsApp disconnected while creating the group.' });
      persistChat({ id: group.id, subject: group.subject ?? name });
      broadcast('chats', { count: 1 });
      res.status(201).json({ created: true, jid: group.id, name: group.subject ?? name });
    } catch (error) {
      res.status(502).json({ error: `Could not create WhatsApp group: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post('/api/whatsapp/call-link', async (req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
    const type = req.body?.type;
    if (type !== 'audio' && type !== 'video') return res.status(400).json({ error: 'Call type must be audio or video.' });
    try {
      const link = await sock.createCallLink(type);
      if (!link) return res.status(502).json({ error: 'WhatsApp did not return a call link.' });
      res.json({ link, type });
    } catch (error) {
      res.status(502).json({ error: `Could not create a WhatsApp call link: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post('/api/whatsapp/profile-status', async (req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : null;
    if (text === null || text.length > 139) return res.status(400).json({ error: 'WhatsApp About text must be 139 characters or fewer.' });
    try {
      await sock.updateProfileStatus(text);
      res.json({ updated: true });
    } catch (error) {
      res.status(502).json({ error: `Could not update WhatsApp About: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  // ── Group administration ───────────────────────────────────────────────────
  const GROUP_JID = /^\d+(-\d+)?@g\.us$/;
  const PHONE_JID = /^\d{8,15}@s\.whatsapp\.net$/;

  function normalizeParticipantJids(value) {
    if (!Array.isArray(value)) return null;
    const jids = [...new Set(value.map((entry) => {
      const raw = String(entry).trim();
      if (PHONE_JID.test(raw)) return raw;
      const digits = raw.replace(/\D/g, '');
      return digits.length >= 8 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : null;
    }).filter(Boolean))];
    return jids.length ? jids : null;
  }

  async function withSocket(res, label, action) {
    if (!sock || connectionState.status !== 'online') {
      res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
      return;
    }
    const socket = sock;
    try {
      const result = await action(socket);
      if (sock !== socket) {
        res.status(409).json({ error: 'WhatsApp disconnected during the operation.' });
        return;
      }
      res.json(result === undefined ? { updated: true } : result);
    } catch (error) {
      res.status(502).json({ error: `Could not ${label}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  // Full metadata for one group: participants with admin flags, settings, invite code.
  app.get('/api/whatsapp/groups/:jid/metadata', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    await withSocket(res, 'fetch group metadata', async (socket) => {
      const metadata = await socket.groupMetadata(jid);
      const participants = (metadata.participants || []).map((participant) => ({
        jid: participant.id,
        admin: participant.admin || null,
        isAdmin: Boolean(participant.isAdmin),
        isSuperAdmin: Boolean(participant.isSuperAdmin),
      }));
      return {
        jid: metadata.id,
        name: metadata.subject,
        subjectOwner: metadata.subjectOwner ?? null,
        description: metadata.desc ?? null,
        creation: metadata.creation ?? null,
        size: metadata.size ?? participants.length,
        restrict: Boolean(metadata.restrict),
        announce: Boolean(metadata.announce),
        memberAddMode: Boolean(metadata.memberAddMode),
        joinApprovalMode: Boolean(metadata.joinApprovalMode),
        ephemeralDuration: metadata.ephemeralDuration ?? 0,
        linkedParent: metadata.linkedParent ?? null,
        isCommunity: Boolean(metadata.isCommunity),
        owner: metadata.owner ?? null,
        participants,
      };
    });
  });

  // List every group KRYNARA is participating in.
  app.get('/api/whatsapp/groups', async (_req, res) => {
    await withSocket(res, 'list groups', async (socket) => {
      const { groups } = await socket.groupFetchAllParticipating();
      const list = Object.values(groups || {}).map((group) => ({
        jid: group.id,
        name: group.subject,
        size: group.size ?? (group.participants?.length ?? 0),
        announce: Boolean(group.announce),
        restrict: Boolean(group.restrict),
      }));
      return { groups: list, count: list.length };
    });
  });

  // Add / remove / promote / demote participants.
  app.post('/api/whatsapp/groups/:jid/participants', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    const action = String(req.body?.action || '');
    if (!['add', 'remove', 'promote', 'demote'].includes(action)) {
      return res.status(400).json({ error: 'Action must be add, remove, promote, or demote.' });
    }
    const participants = normalizeParticipantJids(req.body?.participants);
    if (!participants) return res.status(400).json({ error: 'At least one valid participant phone number is required.' });
    await withSocket(res, `${action} group participants`, async (socket) => {
      const result = await socket.groupParticipantsUpdate(jid, participants, action);
      const changes = (result || []).map((entry) => ({ jid: entry.jid, status: entry.status ?? null, error: entry.error ? String(entry.error) : null }));
      broadcast('groups', { jid, action });
      return { action, changed: changes, count: changes.length };
    });
  });

  // Group settings: announcement-only, locked (admin-only edit), member add mode, join approval,
  // and disappearing messages.
  app.post('/api/whatsapp/groups/:jid/settings', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    const body = req.body ?? {};
    await withSocket(res, 'update group settings', async (socket) => {
      if (typeof body.announceOnly === 'boolean') {
        await socket.groupSettingUpdate(jid, body.announceOnly ? 'announcement' : 'not_announcement');
      }
      if (typeof body.adminsOnlyEditInfo === 'boolean') {
        await socket.groupSettingUpdate(jid, body.adminsOnlyEditInfo ? 'locked' : 'unlocked');
      }
      if (typeof body.membersCanAddOthers === 'boolean') {
        await socket.groupMemberAddMode(jid, body.membersCanAddOthers ? 'all_member_add' : 'admin_add');
      }
      if (typeof body.joinApproval === 'boolean') {
        await socket.groupJoinApprovalMode(jid, body.joinApproval ? 'on' : 'off');
      }
      if (body.disappearingMessages !== undefined) {
        const duration = Number(body.disappearingMessages) || 0;
        if (![0, 86400, 604800, 2592000].includes(duration)) {
          return { error: 'Disappearing messages must be 0, 86400 (1 day), 604800 (1 week), or 2592000 (30 days).' };
        }
        await socket.groupToggleEphemeral(jid, duration);
      }
      broadcast('groups', { jid, settings: true });
      return { updated: true };
    });
  });

  // Rename a group / change its description.
  app.post('/api/whatsapp/groups/:jid/info', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : null;
    const description = typeof req.body?.description === 'string' ? req.body.description : undefined;
    if (name === null && description === undefined) return res.status(400).json({ error: 'A new name or description is required.' });
    if (name !== null && (name.length < 1 || name.length > 100)) return res.status(400).json({ error: 'Group name must be 1-100 characters.' });
    await withSocket(res, 'update group info', async (socket) => {
      if (name !== null) await socket.groupUpdateSubject(jid, name);
      if (description !== undefined) await socket.groupUpdateDescription(jid, description || undefined);
      persistChat({ id: jid, subject: name ?? undefined });
      broadcast('chats', { count: 1 });
      return { updated: true };
    });
  });

  // Group photo: upload replaces it, remove deletes it.
  app.post('/api/whatsapp/groups/:jid/photo', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    await withSocket(res, 'update the group photo', async (socket) => {
      const remove = Boolean(req.body?.remove);
      const dataUrl = typeof req.body?.image === 'string' ? req.body.image : '';
      if (remove) {
        await socket.removeProfilePicture(jid);
        return { removed: true };
      }
      const match = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) return { error: 'An image data URL (png, jpeg, or webp) is required to set the photo.' };
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) return { error: 'The photo must be 1 byte to 5 MB of image data.' };
      await socket.updateProfilePicture(jid, { url: dataUrl });
      return { updated: true };
    });
  });

  // Invite code: read it, reset it, or preview a group from someone else's code.
  app.get('/api/whatsapp/groups/:jid/invite', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    await withSocket(res, 'fetch the group invite code', async (socket) => {
      const code = await socket.groupInviteCode(jid);
      if (!code) return { error: 'WhatsApp did not return an invite code. You may not be an admin.' };
      return { code, url: `https://chat.whatsapp.com/${code}` };
    });
  });

  app.post('/api/whatsapp/groups/:jid/invite/reset', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    await withSocket(res, 'reset the group invite code', async (socket) => {
      const code = await socket.groupRevokeInvite(jid);
      if (!code) return { error: 'WhatsApp did not return a new invite code. You may not be an admin.' };
      return { code, url: `https://chat.whatsapp.com/${code}`, revoked: true };
    });
  });

  // Look up a group you are not in, from an invite code or full URL.
  app.post('/api/whatsapp/groups/invite/inspect', async (req, res) => {
    const raw = String(req.body?.code || '').trim();
    const code = raw.includes('chat.whatsapp.com/') ? raw.split('chat.whatsapp.com/')[1].split(/[/?#]/)[0] : raw;
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) return res.status(400).json({ error: 'A valid invite code or URL is required.' });
    await withSocket(res, 'inspect the invite', async (socket) => {
      const metadata = await socket.groupGetInviteInfo(code);
      return {
        jid: metadata.id,
        name: metadata.subject,
        size: metadata.size ?? (metadata.participants?.length ?? 0),
        description: metadata.desc ?? null,
      };
    });
  });

  // Join a group from an invite code or URL.
  app.post('/api/whatsapp/groups/invite/join', async (req, res) => {
    const raw = String(req.body?.code || '').trim();
    const code = raw.includes('chat.whatsapp.com/') ? raw.split('chat.whatsapp.com/')[1].split(/[/?#]/)[0] : raw;
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) return res.status(400).json({ error: 'A valid invite code or URL is required.' });
    await withSocket(res, 'join the group', async (socket) => {
      const gid = await socket.groupAcceptInvite(code);
      if (gid) persistChat({ id: gid });
      broadcast('chats', { count: 1 });
      return { joined: true, jid: gid ?? null };
    });
  });

  // Join requests waiting for admin approval (groups with joinApprovalMode on).
  app.get('/api/whatsapp/groups/:jid/join-requests', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    await withSocket(res, 'list join requests', async (socket) => {
      const result = await socket.groupRequestParticipantsList(jid);
      const requests = (result?.requestingParticipants || result || []).map((entry) => ({ jid: entry.jid ?? entry, requestedAt: entry.requested_at ?? null }));
      return { requests, count: requests.length };
    });
  });

  app.post('/api/whatsapp/groups/:jid/join-requests', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    const action = req.body?.action === 'reject' ? 'reject' : 'approve';
    const participants = normalizeParticipantJids(req.body?.participants);
    if (!participants) return res.status(400).json({ error: 'At least one valid participant phone number is required.' });
    await withSocket(res, `${action} the join request`, async (socket) => {
      const result = await socket.groupRequestParticipantsUpdate(jid, participants, action);
      return { action, result: result ?? null };
    });
  });

  // Leave (and optionally delete) a group.
  app.post('/api/whatsapp/groups/:jid/leave', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid group address (…@g.us) is required.' });
    await withSocket(res, 'leave the group', async (socket) => {
      await socket.groupLeave(jid);
      broadcast('chats', { count: -1 });
      return { left: true, jid };
    });
  });

  // ── Chat management (archive, pin, mute, star, read state, clear) ─────────
  const VALID_MUTE_DURATIONS = [0, 28800, 604800, 2592000]; // off, 8 hours, 1 week, 30 days

  app.post('/api/whatsapp/chats/:jid/settings', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!ALLOWED_CHAT_JID.test(jid) && !GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid chat or group address is required.' });
    const body = req.body ?? {};
    await withSocket(res, 'update chat settings', async (socket) => {
      if (typeof body.archive === 'boolean') await socket.chatModify({ archive: body.archive, lastMessages: [] }, jid);
      if (typeof body.pin === 'boolean') await socket.chatModify({ pin: body.pin }, jid);
      if (body.mute !== undefined) {
        if (body.mute === null || body.mute === false) {
          await socket.chatModify({ mute: null }, jid);
        } else {
          const duration = Number(body.mute);
          if (!VALID_MUTE_DURATIONS.includes(duration)) {
            return { error: 'Mute must be null/false to unmute, or 28800 (8h), 604800 (1 week), or 2592000 (30 days).' };
          }
          await socket.chatModify({ mute: duration }, jid);
        }
      }
      broadcast('chats', { jid, settings: true });
      return { updated: true };
    });
  });

  // Star or unstar specific messages in a chat.
  app.post('/api/whatsapp/chats/:jid/star', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!ALLOWED_CHAT_JID.test(jid) && !GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid chat or group address is required.' });
    const messages = Array.isArray(req.body?.messages) ? req.body.messages.map((entry) => ({ id: String(entry?.id || ''), fromMe: Boolean(entry?.fromMe) })).filter((entry) => entry.id) : [];
    if (!messages.length) return res.status(400).json({ error: 'At least one message id is required.' });
    const star = req.body?.star !== false;
    await withSocket(res, `${star ? 'star' : 'unstar'} messages`, async (socket) => {
      await socket.chatModify({ star: { messages, star } }, jid);
      return { starred: star, count: messages.length };
    });
  });

  // Mark a chat as read or unread (pass the newest message ids you know of).
  app.post('/api/whatsapp/chats/:jid/read', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!ALLOWED_CHAT_JID.test(jid) && !GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid chat or group address is required.' });
    const messageIds = Array.isArray(req.body?.messageIds) ? req.body.messageIds.map((id) => String(id)).filter(Boolean) : [];
    if (!messageIds.length) return res.status(400).json({ error: 'At least one message id is required.' });
    const read = req.body?.read !== false;
    const rows = getDb().prepare(`
      SELECT message_id AS id, participant, from_me AS fromMe FROM whatsapp_messages
      WHERE jid = ? AND message_id IN (${messageIds.map(() => '?').join(',')})
    `).get(jid, ...messageIds);
    const target = rows?.id ? rows : { id: messageIds[0], participant: undefined, fromMe: false };
    await withSocket(res, `mark the chat ${read ? 'read' : 'unread'}`, async (socket) => {
      await socket.chatModify(
        { markRead: read, lastMessages: [{ id: target.id, fromMe: Boolean(target.fromMe), participant: target.participant ? String(target.participant) : undefined }] },
        jid,
      );
      return { read, count: messageIds.length };
    });
  });

  // Clear a chat's history for KRYNARA only (does not delete on other devices).
  app.post('/api/whatsapp/chats/:jid/clear', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!ALLOWED_CHAT_JID.test(jid) && !GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid chat or group address is required.' });
    await withSocket(res, 'clear the chat', async (socket) => {
      await socket.chatModify({ clear: true, lastMessages: [] }, jid);
      getDb().prepare('DELETE FROM whatsapp_messages WHERE jid = ?').run(jid);
      broadcast('messages', { jid, count: 0 });
      return { cleared: true, jid };
    });
  });

  // ── Privacy, profile, and blocking ──────────────────────────────────────────
  app.get('/api/whatsapp/privacy', async (_req, res) => {
    await withSocket(res, 'fetch privacy settings', async (socket) => socket.fetchPrivacySettings(true));
  });

  const PRIVACY_VALUES = new Set(['all', 'contacts', 'contact_blacklist', 'none']);
  app.post('/api/whatsapp/privacy', async (req, res) => {
    const body = req.body ?? {};
    const setting = Object.keys(body)[0];
    const value = body[setting];
    const allowed = {
      lastSeen: PRIVACY_VALUES,
      profilePhoto: PRIVACY_VALUES,
      status: PRIVACY_VALUES,
      groupAdd: new Set(['all', 'contacts', 'contact_blacklist']),
      readReceipts: new Set(['all', 'none']),
      online: new Set(['all', 'match_last_seen']),
      calls: new Set(['all', 'known']),
      messages: new Set(['all', 'contacts']),
    };
    if (!setting || !allowed[setting] || !allowed[setting].has(value)) {
      return res.status(400).json({ error: `Unknown privacy setting or value. Settings: ${Object.keys(allowed).join(', ')}.` });
    }
    await withSocket(res, `update the ${setting} privacy setting`, async (socket) => {
      const updaters = {
        lastSeen: (v) => socket.updateLastSeenPrivacy(v),
        profilePhoto: (v) => socket.updateProfilePicturePrivacy(v),
        status: (v) => socket.updateStatusPrivacy(v),
        groupAdd: (v) => socket.updateGroupsAddPrivacy(v),
        readReceipts: (v) => socket.updateReadReceiptsPrivacy(v),
        online: (v) => socket.updateOnlinePrivacy(v),
        calls: (v) => socket.updateCallPrivacy(v),
        messages: (v) => socket.updateMessagesPrivacy(v),
      };
      await updaters[setting](value);
      return { setting, value, updated: true };
    });
  });

  app.get('/api/whatsapp/blocklist', async (_req, res) => {
    await withSocket(res, 'fetch the blocklist', async (socket) => {
      const list = await socket.fetchBlocklist();
      return { blocked: list ?? [], count: (list ?? []).length };
    });
  });

  app.post('/api/whatsapp/block', async (req, res) => {
    const jid = String(req.body?.jid || '').trim();
    if (!/^\d{8,15}@s\.whatsapp\.net$/.test(jid) && !ALLOWED_CHAT_JID.test(jid)) {
      return res.status(400).json({ error: 'A valid contact phone number is required.' });
    }
    const action = req.body?.action === 'unblock' ? 'unblock' : 'block';
    await withSocket(res, `${action} the contact`, async (socket) => {
      await socket.updateBlockStatus(jid, action);
      return { jid, action };
    });
  });

  // Display name (the name others see for you).
  app.post('/api/whatsapp/profile-name', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 1 || name.length > 30) return res.status(400).json({ error: 'A profile name of 1-30 characters is required.' });
    await withSocket(res, 'update the profile name', async (socket) => {
      await socket.updateProfileName(name);
      return { updated: true, name };
    });
  });

  // Own profile photo: upload a data URL, or remove it.
  app.post('/api/whatsapp/profile-photo', async (req, res) => {
    await withSocket(res, 'update the profile photo', async (socket) => {
      if (req.body?.remove) {
        await socket.removeProfilePicture(socket.user?.id);
        return { removed: true };
      }
      const dataUrl = typeof req.body?.image === 'string' ? req.body.image : '';
      const match = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) return { error: 'An image data URL (png, jpeg, or webp) is required to set the photo.' };
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) return { error: 'The photo must be 1 byte to 5 MB of image data.' };
      await socket.updateProfilePicture(socket.user?.id, { url: dataUrl });
      return { updated: true };
    });
  });

  // Fetch a contact's or group's picture URL (may be null if not public).
  app.get('/api/whatsapp/profile-photo/:jid', async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!ALLOWED_CHAT_JID.test(jid) && !GROUP_JID.test(jid)) return res.status(400).json({ error: 'A valid chat or group address is required.' });
    await withSocket(res, 'fetch the profile photo', async (socket) => {
      const url = await socket.profilePictureUrl(jid, 'image').catch(() => undefined);
      const preview = url ? undefined : await socket.profilePictureUrl(jid, 'preview').catch(() => undefined);
      const link = url ?? preview ?? null;
      return { jid, url: link ? `https://pps.whatsapp.net${new URL(link).pathname}` : null };
    });
  });

  app.get('/api/whatsapp/media/:mediaId', (req, res) => {
    try {
      if (!/^[\da-f-]{36}$/i.test(req.params.mediaId)) return res.status(404).json({ error: 'WhatsApp media was not found.' });
      const media = getDb().prepare(`
        SELECT media_path AS path, media_mime_type AS mimeType, media_file_name AS fileName,
          media_status AS status, media_error AS error
        FROM whatsapp_messages WHERE media_id = ? LIMIT 1
      `).get(req.params.mediaId);
      if (!media || media.status !== 'downloaded' || !media.path) {
        return res.status(404).json({ error: media?.error || 'WhatsApp media is not available locally.' });
      }
      const storedFileName = path.basename(media.path);
      if (storedFileName !== media.path || !storedFileName.startsWith(`${req.params.mediaId}.`)) {
        return res.status(404).json({ error: 'WhatsApp media was not found.' });
      }
      const filePath = path.join(MEDIA_DIR, storedFileName);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'WhatsApp media file is missing from local storage.' });
      const mimeType = String(media.mimeType ?? '').split(';', 1)[0].trim();
      const safeMimeType = /^[\w.+-]+\/[\w.+-]+$/.test(mimeType) ? mimeType : 'application/octet-stream';
      const disposition = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|ogg|quicktime|3gpp)|audio\/(ogg|mpeg|mp4|webm|wav|aac|amr|opus))$/i.test(safeMimeType)
        ? 'inline'
        : 'attachment';
      const downloadName = String(media.fileName || `whatsapp-media${mediaExtension(media.mimeType, null)}`).replace(/[\r\n"]/g, '_');
      res.setHeader('Content-Type', safeMimeType);
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const fileStream = fs.createReadStream(filePath);
      fileStream.on('error', (error) => {
        console.error('[krynara-whatsapp] media serving failed:', error);
        if (res.headersSent) res.destroy(error);
        else res.status(404).json({ error: 'WhatsApp media could not be read from local storage.' });
      });
      fileStream.pipe(res);
    } catch (error) {
      res.status(500).json({ error: `Could not load WhatsApp media: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post('/api/whatsapp/media/:mediaId/retry', async (req, res) => {
    if (!/^[\da-f-]{36}$/i.test(req.params.mediaId)) {
      return res.status(404).json({ error: 'WhatsApp media was not found.' });
    }
    if (!sock || connectionState.status !== 'online') {
      return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
    }

    const media = getDb().prepare(`
      SELECT jid, message_id AS messageId, timestamp, from_me AS fromMe,
        participant, media_status AS mediaStatus, media_path AS mediaPath
      FROM whatsapp_messages WHERE media_id = ? LIMIT 1
    `).get(req.params.mediaId);
    if (!media) return res.status(404).json({ error: 'WhatsApp media was not found.' });
    if (media.mediaStatus === 'downloaded' && media.mediaPath) {
      return res.json({ status: 'downloaded' });
    }

    const socket = sock;
    const cacheKey = `${media.jid}\u0000${media.messageId}`;
    let message = recoverableMediaMessages.get(cacheKey);
    try {
      if (!message && media.jid.endsWith('@newsletter')) {
        const since = Math.max(0, Math.floor(new Date(media.timestamp).getTime() / 1000) - 3600);
        const response = await withTimeout(
          socket.newsletterFetchMessages(media.jid, 50, since, 0),
          35000,
          'WhatsApp did not respond to the channel media recovery request within 35 seconds.',
        );
        if (sock !== socket) return res.status(409).json({ error: 'WhatsApp disconnected while recovering the channel attachment.' });
        message = findNewsletterMessage(response, media.jid, media.messageId);
      }

      if (message && mediaKeyFromMessage(message)) {
        await downloadMedia(message, socket);
        const result = getDb().prepare(`
          SELECT media_status AS status, media_error AS error
          FROM whatsapp_messages WHERE jid = ? AND message_id = ?
        `).get(media.jid, media.messageId);
        if (result?.status === 'downloaded') return res.json({ status: result.status });
        return res.status(422).json({ error: result?.error || 'WhatsApp media download failed.' });
      }

      if (media.jid.endsWith('@newsletter')) {
        if (!message) {
          return res.status(422).json({
            error: 'WhatsApp did not return this channel message for re-download. It may no longer be available in channel history.',
          });
        }
        return res.status(422).json({
          error: 'WhatsApp returned this channel attachment without a media decryption key. KRYNARA cannot decrypt it; ask the channel to repost the media.',
        });
      }

      await socket.requestPlaceholderResend({
        remoteJid: media.jid,
        id: media.messageId,
        fromMe: Boolean(media.fromMe),
        participant: media.participant || undefined,
      });
      return res.status(202).json({ status: 'resend_requested', message: 'Requested the linked phone to resend this message. KRYNARA will download the media if WhatsApp supplies its decryption key.' });
    } catch (error) {
      console.error(`[krynara-whatsapp] media recovery failed for ${media.jid}/${media.messageId}:`, error);
      return res.status(502).json({ error: `Could not recover WhatsApp media: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.get('/api/whatsapp/messages/:jid', (req, res) => {
    try {
      const limitValue = Number(req.query.limit);
      const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 500) : 200;
      const before = typeof req.query.before === 'string' ? req.query.before : null;
      const beforeId = typeof req.query.beforeId === 'string' ? req.query.beforeId : null;
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
      const messages = getDb().prepare(`
        SELECT message_id AS id, jid, sender, participant, from_me AS fromMe, text, message_type AS type,
          timestamp AS at, message_content AS content, media_id AS mediaId,
          media_mime_type AS mediaMimeType, media_file_name AS mediaFileName,
          media_status AS mediaStatus, media_error AS mediaError, rowid
        FROM whatsapp_messages
        WHERE jid = ? AND (? = '' OR text LIKE '%' || ? || '%') AND (
          ? IS NULL OR timestamp < ? OR (timestamp = ? AND rowid < (
            SELECT rowid FROM whatsapp_messages WHERE jid = ? AND message_id = ?
          ))
        )
        ORDER BY timestamp DESC, rowid DESC
        LIMIT ?
      `).all(String(req.params.jid), search, search, before, before, before, String(req.params.jid), beforeId, limit).reverse();
      res.json({
        jid: req.params.jid,
        messages: messages.map(({ rowid, content, ...message }) => ({
          ...message,
          fromMe: Boolean(message.fromMe),
          content: content ? JSON.parse(content) : null,
        })),
        hasOlder: messages.length === limit,
      });
    } catch (error) {
      res.status(500).json({ error: `Could not load stored WhatsApp messages: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post('/api/whatsapp/forward', async (req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
    const { jid, messageId, toJid } = req.body ?? {};
    if (!jid || !messageId || !toJid) return res.status(400).json({ error: 'jid, messageId, and toJid are required.' });
    const destinationInput = String(toJid).trim();
    const destination = destinationInput.includes('@')
      ? destinationInput
      : `${destinationInput.replace(/\D/g, '')}@s.whatsapp.net`;
    if (!/^[^@\s]{1,160}@(s\.whatsapp\.net|g\.us|newsletter|lid)$/.test(destination)) {
      return res.status(400).json({ error: 'Enter a valid WhatsApp phone number or chat address.' });
    }

    const message = getDb().prepare(`
      SELECT message_id AS id, jid, text, message_type AS type, media_id AS mediaId,
        media_mime_type AS mediaMimeType, media_file_name AS mediaFileName,
        media_path AS mediaPath, media_status AS mediaStatus
      FROM whatsapp_messages WHERE jid = ? AND message_id = ?
    `).get(String(jid), String(messageId));
    if (!message) return res.status(404).json({ error: 'The selected message is not in the local archive.' });

    try {
      let payload;
      if (MEDIA_TYPES.has(message.type)) {
        if (message.mediaStatus !== 'downloaded' || !message.mediaPath) {
          return res.status(409).json({ error: 'This attachment is not available in KRYNARA storage to forward.' });
        }
        const storedName = path.basename(message.mediaPath);
        const filePath = path.join(MEDIA_DIR, storedName);
        if (storedName !== message.mediaPath || !storedName.startsWith(`${message.mediaId}.`) || !fs.existsSync(filePath)) {
          return res.status(404).json({ error: 'The stored attachment file is missing.' });
        }
        const mediaType = ({
          imageMessage: 'image',
          videoMessage: 'video',
          ptvMessage: 'video',
          audioMessage: 'audio',
          documentMessage: 'document',
          stickerMessage: 'sticker',
        })[message.type];
        payload = {
          [mediaType]: fs.createReadStream(filePath),
          mimetype: message.mediaMimeType || 'application/octet-stream',
          contextInfo: { isForwarded: true, forwardingScore: 1 },
          ...(mediaType === 'document' ? { fileName: message.mediaFileName || `whatsapp-media${path.extname(filePath)}` } : {}),
          ...(mediaType === 'audio' ? { ptt: false } : {}),
        };
      } else {
        payload = {
          text: message.text || '(message)',
          contextInfo: { isForwarded: true, forwardingScore: 1 },
        };
      }
      const result = await sock.sendMessage(destination, payload);
      if (result) {
        try {
          const forwarded = persistMessage(result);
          if (MEDIA_TYPES.has(message.type) && message.mediaPath && forwarded?.mediaId) {
            const extension = path.extname(message.mediaPath) || '.bin';
            const copiedName = `${forwarded.mediaId}${extension}`;
            await fsPromises.copyFile(path.join(MEDIA_DIR, path.basename(message.mediaPath)), path.join(MEDIA_DIR, copiedName));
            getDb().prepare(`
              UPDATE whatsapp_messages SET media_status = 'downloaded', media_path = ?
              WHERE jid = ? AND message_id = ?
            `).run(copiedName, destination, result.key.id);
          }
        } catch (error) {
          console.error('[krynara-whatsapp] forwarded message could not be archived:', error);
          return res.status(500).json({ error: `Message forwarded, but local archive failed: ${error instanceof Error ? error.message : String(error)}` });
        }
      }
      res.json({ forwarded: true, id: result?.key?.id ?? null });
    } catch (error) {
      res.status(502).json({ error: `Could not forward the message: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post('/api/whatsapp/react', async (req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
    const { jid, messageId, reaction } = req.body ?? {};
    if (!jid || !messageId || typeof reaction !== 'string' || [...reaction].length > 8) {
      return res.status(400).json({ error: 'jid, messageId, and a valid reaction are required.' });
    }
    const target = getDb().prepare('SELECT message_id AS id, jid, participant, from_me AS fromMe FROM whatsapp_messages WHERE jid = ? AND message_id = ?')
      .get(String(jid), String(messageId));
    if (!target) return res.status(404).json({ error: 'The selected message is not in the local archive.' });
    try {
      await sock.sendMessage(target.jid, {
        react: {
          text: reaction,
          key: { remoteJid: target.jid, id: target.id, fromMe: Boolean(target.fromMe), ...(target.participant ? { participant: target.participant } : {}) },
        },
      });
      res.json({ reacted: true });
    } catch (error) {
      res.status(502).json({ error: `Could not react to the message: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post('/api/whatsapp/delete', async (req, res) => {
    const { jid, messageId, scope } = req.body ?? {};
    if (!jid || !messageId || !['local', 'everyone'].includes(scope)) {
      return res.status(400).json({ error: 'jid, messageId, and a valid delete scope are required.' });
    }
    const db = getDb();
    const message = db.prepare(`
      SELECT message_id AS id, jid, participant, from_me AS fromMe, media_path AS mediaPath
      FROM whatsapp_messages WHERE jid = ? AND message_id = ?
    `).get(String(jid), String(messageId));
    if (!message) return res.status(404).json({ error: 'The selected message is not in the local archive.' });
    if (scope === 'everyone') {
      if (!message.fromMe) return res.status(403).json({ error: 'Only messages sent from this account can be deleted for everyone.' });
      if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
      try {
        await sock.sendMessage(message.jid, {
          delete: { remoteJid: message.jid, id: message.id, fromMe: true, ...(message.participant ? { participant: message.participant } : {}) },
        });
      } catch (error) {
        return res.status(502).json({ error: `WhatsApp could not delete the message for everyone: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
    db.prepare('DELETE FROM whatsapp_messages WHERE jid = ? AND message_id = ?').run(message.jid, message.id);
    const latestMessage = db.prepare(`
      SELECT COALESCE(NULLIF(text, ''), '[' || message_type || ']') AS text, timestamp
      FROM whatsapp_messages WHERE jid = ?
      ORDER BY timestamp DESC, rowid DESC LIMIT 1
    `).get(message.jid);
    db.prepare('UPDATE whatsapp_chats SET last_message = ?, last_message_at = ? WHERE jid = ?')
      .run(latestMessage?.text ?? null, latestMessage?.timestamp ?? null, message.jid);
    if (message.mediaPath) {
      const storedName = path.basename(message.mediaPath);
      if (storedName === message.mediaPath) {
        try {
          await fsPromises.rm(path.join(MEDIA_DIR, storedName), { force: true });
        } catch (error) {
          console.error('[krynara-whatsapp] deleted message media cleanup failed:', error);
        }
      }
    }
    res.json({ deleted: true, scope });
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
    const socket = sock;
    const { jid, text, replyToMessageId } = req.body ?? {};
    if (typeof jid !== 'string' || !ALLOWED_CHAT_JID.test(jid) || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'A valid WhatsApp chat and non-empty message are required.' });
    }
    const body = String(text).slice(0, 4096);
    let result;
    try {
      let options;
      if (replyToMessageId) {
        const reply = getDb().prepare(`
          SELECT message_id AS id, jid, participant, from_me AS fromMe, message_content AS content
          FROM whatsapp_messages WHERE jid = ? AND message_id = ?
        `).get(String(jid), String(replyToMessageId));
        if (!reply) return res.status(404).json({ error: 'The message being replied to is not in the local archive.' });
        options = {
          quoted: {
            key: { remoteJid: reply.jid, id: reply.id, fromMe: Boolean(reply.fromMe), ...(reply.participant ? { participant: reply.participant } : {}) },
            message: reply.content ? JSON.parse(reply.content) : { conversation: '(message)' },
          },
        };
      }
      result = await socket.sendMessage(jid, { text: body }, options);
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    try {
      persistMessage({
        key: { ...result?.key, remoteJid: result?.key?.remoteJid ?? jid, fromMe: true },
        message: { conversation: body },
        messageTimestamp: Math.floor(Date.now() / 1000),
      });
      res.json({ sent: true, id: result?.key?.id ?? null });
    } catch (error) {
      console.error('[krynara-whatsapp] sent message could not be saved:', error);
      res.status(500).json({ error: `Message sent, but local storage failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post(
    '/api/whatsapp/send-media/:jid',
    async (req, res) => {
      if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'KRYNARA WhatsApp is not connected.' });
      const jid = String(req.params.jid);
      if (!ALLOWED_CHAT_JID.test(jid)) return res.status(400).json({ error: 'A valid WhatsApp chat address is required.' });
      const contentLength = req.get('content-length');
      if (contentLength !== undefined && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_UPLOAD_BYTES)) {
        return res.status(413).json({ error: `WhatsApp uploads are limited to ${MAX_UPLOAD_BYTES_LABEL}.` });
      }

      const mimeType = String(req.get('x-media-mime-type') ?? 'application/octet-stream').split(';', 1)[0].trim().toLowerCase();
      if (!/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)) return res.status(400).json({ error: 'A valid media MIME type is required.' });
      const fileName = String(req.query.fileName ?? 'attachment').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180);
      const caption = String(req.query.caption ?? '').slice(0, 4096);
      const replyToMessageId = typeof req.query.replyToMessageId === 'string' ? req.query.replyToMessageId : null;
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      const temporaryPath = path.join(MEDIA_DIR, `${crypto.randomUUID()}.upload.part`);
      let storedMediaPath;
      let uploadBytes = 0;
      let uploadTooLarge = false;
      const sizeGuard = new Transform({
        transform(chunk, _encoding, callback) {
          if (uploadTooLarge) {
            callback(null);
            return;
          }
          uploadBytes += chunk.length;
          if (uploadBytes > MAX_UPLOAD_BYTES) {
            uploadTooLarge = true;
            callback(null);
            return;
          }
          callback(null, chunk);
        },
      });
      try {
        await pipeline(req, sizeGuard, fs.createWriteStream(temporaryPath, { flags: 'wx' }));
      } catch (error) {
        await fsPromises.rm(temporaryPath, { force: true }).catch((cleanupError) => {
          console.error('[krynara-whatsapp] incomplete upload cleanup failed:', cleanupError);
        });
        console.error('[krynara-whatsapp] media upload stream failed:', error);
        return res.status(400).json({ error: `Could not receive the attachment: ${error instanceof Error ? error.message : String(error)}` });
      }
      if (uploadTooLarge) {
        await fsPromises.rm(temporaryPath, { force: true });
        return res.status(413).json({ error: `WhatsApp uploads are limited to ${MAX_UPLOAD_BYTES_LABEL}.` });
      }
      if (uploadBytes === 0) {
        await fsPromises.rm(temporaryPath, { force: true });
        return res.status(400).json({ error: 'A non-empty media file is required.' });
      }

      const mediaKind = mimeType.startsWith('image/') ? 'image'
        : mimeType.startsWith('video/') ? 'video'
          : mimeType.startsWith('audio/') ? 'audio'
            : 'document';
      const mediaType = `${mediaKind}Message`;
      const payload = {
        [mediaKind]: fs.createReadStream(temporaryPath),
        mimetype: mimeType,
        ...(mediaKind === 'document' ? { fileName } : {}),
        ...(caption ? { caption } : {}),
      };

      try {
        const socket = sock;
        if (!socket || connectionState.status !== 'online') {
          await fsPromises.rm(temporaryPath, { force: true });
          return res.status(409).json({ error: 'KRYNARA WhatsApp disconnected while receiving the attachment.' });
        }
        let options;
        if (replyToMessageId) {
          const reply = getDb().prepare(`
            SELECT message_id AS id, jid, participant, from_me AS fromMe, message_content AS content
            FROM whatsapp_messages WHERE jid = ? AND message_id = ?
          `).get(jid, replyToMessageId);
          if (!reply) {
            await fsPromises.rm(temporaryPath, { force: true });
            return res.status(404).json({ error: 'The message being replied to is not in the local archive.' });
          }
          options = {
            quoted: {
              key: { remoteJid: reply.jid, id: reply.id, fromMe: Boolean(reply.fromMe), ...(reply.participant ? { participant: reply.participant } : {}) },
              message: reply.content ? JSON.parse(reply.content) : { conversation: '(message)' },
            },
          };
        }
        const result = await socket.sendMessage(jid, payload, options);
        if (sock !== socket) {
          await fsPromises.rm(temporaryPath, { force: true });
          return res.status(409).json({ error: 'WhatsApp disconnected while sending the attachment.' });
        }
        try {
          persistMessage(result);
          const storedMessage = getDb().prepare(`
            SELECT media_id AS mediaId FROM whatsapp_messages WHERE jid = ? AND message_id = ?
          `).get(jid, result.key.id);
          if (storedMessage?.mediaId) {
            const storedName = `${storedMessage.mediaId}${mediaExtension(mimeType, fileName)}`;
            storedMediaPath = path.join(MEDIA_DIR, storedName);
            await fsPromises.rename(temporaryPath, storedMediaPath);
            getDb().prepare(`
              UPDATE whatsapp_messages SET media_status = 'downloaded', media_path = ?, media_error = NULL
              WHERE jid = ? AND message_id = ?
            `).run(storedName, jid, result.key.id);
            storedMediaPath = null;
          } else {
            await fsPromises.rm(temporaryPath, { force: true });
          }
        } catch (error) {
          await fsPromises.rm(temporaryPath, { force: true }).catch((cleanupError) => {
            console.error('[krynara-whatsapp] sent media upload cleanup failed:', cleanupError);
          });
          if (storedMediaPath) await fsPromises.rm(storedMediaPath, { force: true }).catch((cleanupError) => {
            console.error('[krynara-whatsapp] sent media archive cleanup failed:', cleanupError);
          });
          console.error('[krynara-whatsapp] sent media could not be archived:', error);
          return res.status(500).json({ error: `Attachment sent, but local storage failed: ${error instanceof Error ? error.message : String(error)}` });
        }
        broadcast('messages', { jid, count: 1 });
        res.json({ sent: true, id: result.key.id, type: mediaType });
      } catch (error) {
        await fsPromises.rm(temporaryPath, { force: true }).catch((cleanupError) => {
          console.error('[krynara-whatsapp] failed upload cleanup failed:', cleanupError);
        });
        res.status(502).json({ error: `Could not send WhatsApp media: ${error instanceof Error ? error.message : String(error)}` });
      }
    },
  );

  app.post('/api/whatsapp/pairing-code', async (req, res) => {
    if (!sock) await startKrynaraWhatsApp();
    if (!sock) return res.status(409).json({ error: 'Start a session first.' });
    const { phoneNumber } = req.body ?? {};
    const digits = String(phoneNumber ?? '').replace(/\D/g, '');
    if (digits.length < 8) return res.status(400).json({ error: 'Provide the full phone number in international format digits only, e.g. 923001234567.' });
    try {
      const code = await sock.requestPairingCode(digits);
      const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
      setState({ pairingCode: formatted });
      broadcast('pairingCode', { code: formatted });
      res.json({ code: formatted });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/whatsapp/logout', async (_req, res) => {
    intentionalLogout = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try {
      const socket = sock;
      if (socket) {
        try {
          await socket.logout();
        } catch (error) {
          console.error('[krynara-whatsapp] logout request failed:', error);
          if (sock === socket) sock = null;
        }
      }
      sock = null;
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      setState({ status: 'offline', qr: null, user: null, lastError: null });
      res.json({ loggedOut: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/whatsapp/events', (req, res) => {
    const { event, payload } = req.body ?? {};
    if (event === 'messages') broadcast('messages', payload ?? {});
    res.json({ relayed: true });
  });

  return { getState: () => connectionState, broadcast };
}

function attachKrynaraWhatsAppWs(server) {
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ server, path: '/ws/whatsapp' });
  wss.on('connection', (client) => {
    wsClients.add(client);
    client.send(JSON.stringify({ event: 'status', payload: connectionState }));
    client.on('close', () => wsClients.delete(client));
  });
  return wss;
}

module.exports = { registerKrynaraWhatsApp, attachKrynaraWhatsAppWs, startKrynaraWhatsApp, getWhatsAppState: () => connectionState };
