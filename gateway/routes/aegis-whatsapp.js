/**
 * AEGIS WhatsApp — Baileys-powered WhatsApp integration for the AEGIS HUD.
 * Auth persists in gateway/data/baileys_auth so sessions survive restarts.
 */
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const { getDb } = require('./memory');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const AUTH_DIR = path.join(__dirname, '..', 'data', 'baileys_auth');

let sock = null;
let startingPromise = null;
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
      INSERT INTO whatsapp_messages (message_id, jid, sender, from_me, text, message_type, timestamp)
      VALUES (@messageId, @jid, @sender, @fromMe, @text, @messageType, @timestamp)
      ON CONFLICT(jid, message_id) DO NOTHING
    `),
  };
}

function messageContent(message) {
  let content = message.message ?? {};
  while (content.ephemeralMessage?.message || content.viewOnceMessage?.message || content.viewOnceMessageV2?.message || content.documentWithCaptionMessage?.message) {
    content = content.ephemeralMessage?.message
      ?? content.viewOnceMessage?.message
      ?? content.viewOnceMessageV2?.message
      ?? content.documentWithCaptionMessage?.message;
  }
  const messageType = Object.keys(content)[0] ?? 'unknown';
  const item = content[messageType] ?? {};
  const text = content.conversation
    ?? content.extendedTextMessage?.text
    ?? item.caption
    ?? item.fileName
    ?? item.displayName
    ?? item.name
    ?? item.address
    ?? '';
  return { messageType, text: String(text) };
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
  const { messageType, text } = messageContent(message);
  const sender = String(message.pushName ?? message.key.participant ?? '');
  const fromMe = message.key.fromMe ? 1 : 0;
  store.saveMessage.run({ messageId, jid, sender, fromMe, text, messageType, timestamp });
  store.upsertChat.run({
    jid,
    name: sender && !fromMe && !jid.endsWith('@g.us') ? sender : '',
    lastMessage: text || `[${messageType}]`,
    lastMessageAt: timestamp,
  });
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
  process.stdout.write(`[aegis-whatsapp] setState -> ${connectionState.status}${connectionState.qr ? ' (qr ready)' : ''}\n`);
}

async function startAegisWhatsApp() {
  if (startingPromise) return startingPromise;
  startingPromise = (async () => {
    try {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();
      sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['AEGIS WhatsApp', 'Chrome', '1.0'],
        syncFullHistory: true,
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('messaging-history.set', ({ chats = [], contacts = [], messages = [] }) => {
        try {
          const store = getWhatsAppStore();
          const saveHistory = getDb().transaction(() => {
            for (const chat of chats) persistChat(chat, store);
            for (const contact of contacts) persistContact(contact, store);
            for (const message of messages) persistMessage(message, store);
          });
          saveHistory();
          setState({ historySyncStatus: 'syncing' });
          broadcast('history', { chats: chats.length, contacts: contacts.length, messages: messages.length });
          console.log(`[aegis-whatsapp] saved history batch: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`);
        } catch (error) {
          console.error('[aegis-whatsapp] history persistence failed:', error);
          setState({ historySyncStatus: 'error', lastError: `Could not save WhatsApp history: ${error instanceof Error ? error.message : String(error)}` });
        }
      });

      sock.ev.on('messaging-history.status', ({ status }) => {
        setState({ historySyncStatus: status });
      });

      sock.ev.on('chats.upsert', (chats) => {
        try {
          const store = getWhatsAppStore();
          const saveChats = getDb().transaction(() => {
            for (const chat of chats) persistChat(chat, store);
          });
          saveChats();
          broadcast('chats', { count: chats.length });
        } catch (error) {
          console.error('[aegis-whatsapp] chat persistence failed:', error);
          setState({ lastError: `Could not save WhatsApp chats: ${error instanceof Error ? error.message : String(error)}` });
        }
      });

      sock.ev.on('chats.update', (chats) => {
        try {
          const store = getWhatsAppStore();
          const saveChats = getDb().transaction(() => {
            for (const chat of chats) persistChat(chat, store);
          });
          saveChats();
        } catch (error) {
          console.error('[aegis-whatsapp] chat update persistence failed:', error);
        }
      });

      sock.ev.on('contacts.upsert', (contacts) => {
        try {
          const store = getWhatsAppStore();
          const saveContacts = getDb().transaction(() => {
            for (const contact of contacts) persistContact(contact, store);
          });
          saveContacts();
        } catch (error) {
          console.error('[aegis-whatsapp] contact persistence failed:', error);
        }
      });

      sock.ev.on('contacts.update', (contacts) => {
        try {
          const store = getWhatsAppStore();
          const saveContacts = getDb().transaction(() => {
            for (const contact of contacts) persistContact(contact, store);
          });
          saveContacts();
        } catch (error) {
          console.error('[aegis-whatsapp] contact update persistence failed:', error);
        }
      });

      sock.ev.on('connection.update', (update) => {
        console.log('[aegis-whatsapp] connection.update:', JSON.stringify({ connection: update.connection, qr: Boolean(update.qr) }));
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          QRCode.toDataURL(qr, { margin: 1, width: 512, color: { dark: '#050A0E', light: '#E6FBFF' } })
            .then((qrDataUrl) => setState({ status: 'waiting_qr', qr: qrDataUrl, lastError: null }))
            .catch((error) => setState({ status: 'error', lastError: `QR encode failed: ${error.message}` }));
        }
        if (connection === 'connecting') setState({ status: 'connecting', qr: null });
        if (connection === 'open') {
          setState({ status: 'online', qr: null, user: sock?.user ?? null, lastError: null, historySyncStatus: 'syncing' });
        }
        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.code;
          const reason = DisconnectReason[code] ?? String(code ?? 'unknown');
          sock = null;
          if (code === DisconnectReason.loggedOut) {
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
            setState({ status: 'reconnecting', qr: null, user: null, lastError: 'The previous WhatsApp link expired. Preparing a fresh QR code.' });
            setTimeout(() => void startAegisWhatsApp(), 500);
          } else {
            setState({ status: 'reconnecting', qr: null, lastError: `Disconnected (${reason}) — restarting` });
            setTimeout(() => void startAegisWhatsApp().catch(() => undefined), 3000);
          }
        }
      });

      sock.ev.on('messages.upsert', ({ messages = [] }) => {
        try {
          const store = getWhatsAppStore();
          const saveMessages = getDb().transaction(() => {
            for (const message of messages) persistMessage(message, store);
          });
          saveMessages();
          broadcast('messages', { jid: messages[0]?.key?.remoteJid, count: messages.length });
        } catch (error) {
          console.error('[aegis-whatsapp] message persistence failed:', error);
          setState({ lastError: `Could not save WhatsApp messages: ${error instanceof Error ? error.message : String(error)}` });
        }
      });
      setState({ status: 'connecting', qr: null, lastError: null });
      console.log('[aegis-whatsapp] socket wired, auth dir:', AUTH_DIR);
    } catch (error) {
      setState({ status: 'error', lastError: error instanceof Error ? error.message : String(error) });
      console.error('[aegis-whatsapp] start failed:', error);
    } finally {
      startingPromise = null;
    }
  })();
  return startingPromise;
}

function registerAegisWhatsApp(app, { broadcastStatus } = {}) {
  if (broadcastStatus) wsBroadcaster = broadcastStatus;

  app.get('/api/whatsapp/status', (_req, res) => res.json(connectionState));

  app.post('/api/whatsapp/start', async (_req, res) => {
    if (connectionState.status === 'online') return res.json(connectionState);
    await startAegisWhatsApp();
    res.json(connectionState);
  });

  app.get('/api/whatsapp/qr', (_req, res) => {
    if (connectionState.status === 'online') return res.json({ qr: null, status: connectionState.status, user: connectionState.user });
    if (!sock) void startAegisWhatsApp();
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
          chats.last_message_at AS lastMessageAt
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

  app.get('/api/whatsapp/messages/:jid', (req, res) => {
    try {
      const limitValue = Number(req.query.limit);
      const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 500) : 200;
      const before = typeof req.query.before === 'string' ? req.query.before : null;
      const beforeId = typeof req.query.beforeId === 'string' ? req.query.beforeId : null;
      const messages = getDb().prepare(`
        SELECT message_id AS id, jid, sender, from_me AS fromMe, text, message_type AS type, timestamp AS at, rowid
        FROM whatsapp_messages
        WHERE jid = ? AND (
          ? IS NULL OR timestamp < ? OR (timestamp = ? AND rowid < (
            SELECT rowid FROM whatsapp_messages WHERE jid = ? AND message_id = ?
          ))
        )
        ORDER BY timestamp DESC, rowid DESC
        LIMIT ?
      `).all(String(req.params.jid), before, before, before, String(req.params.jid), beforeId, limit).reverse();
      res.json({
        jid: req.params.jid,
        messages: messages.map(({ rowid, ...message }) => ({ ...message, fromMe: Boolean(message.fromMe) })),
        hasOlder: messages.length === limit,
      });
    } catch (error) {
      res.status(500).json({ error: `Could not load stored WhatsApp messages: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'AEGIS WhatsApp is not connected.' });
    const { jid, text } = req.body ?? {};
    if (!jid || !text) return res.status(400).json({ error: 'jid and text are required.' });
    const body = String(text).slice(0, 4096);
    let result;
    try {
      result = await sock.sendMessage(jid, { text: body });
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
      console.error('[aegis-whatsapp] sent message could not be saved:', error);
      res.status(500).json({ error: `Message sent, but local storage failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  app.post('/api/whatsapp/pairing-code', async (req, res) => {
    if (!sock) await startAegisWhatsApp();
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
    try {
      if (sock) { try { await sock.logout(); } catch { /* already gone */ } }
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

function attachAegisWhatsAppWs(server) {
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ server, path: '/ws/whatsapp' });
  wss.on('connection', (client) => {
    wsClients.add(client);
    client.send(JSON.stringify({ event: 'status', payload: connectionState }));
    client.on('close', () => wsClients.delete(client));
  });
  return wss;
}

module.exports = { registerAegisWhatsApp, attachAegisWhatsAppWs, startAegisWhatsApp, getWhatsAppState: () => connectionState };
