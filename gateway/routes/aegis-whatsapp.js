/**
 * AEGIS WhatsApp — Baileys-powered WhatsApp integration for the AEGIS HUD.
 * Auth persists in gateway/data/baileys_auth so sessions survive restarts.
 */
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');

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
let messageLog = [];
const wsClients = new Set();
let wsBroadcaster = null;

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
        syncFullHistory: false,
      });

      sock.ev.on('creds.update', saveCreds);

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
          setState({ status: 'online', qr: null, user: sock?.user ?? null, lastError: null });
        }
        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.code;
          const reason = DisconnectReason[code] ?? String(code ?? 'unknown');
          sock = null;
          if (code === DisconnectReason.loggedOut) {
            setState({ status: 'offline', qr: null, user: null, lastError: `Logged out (${reason})` });
          } else {
            setState({ status: 'reconnecting', qr: null, lastError: `Disconnected (${reason}) — restarting` });
            setTimeout(() => void startAegisWhatsApp().catch(() => undefined), 3000);
          }
        }
      });

      sock.ev.on('messages.upsert', ({ messages }) => {
        for (const message of messages) {
          const key = message.key;
          if (!key || key.remoteJid === 'status@broadcast') continue;
          const text = message.message?.conversation
            || message.message?.extendedTextMessage?.text
            || message.message?.imageMessage?.caption
            || message.message?.videoMessage?.caption
            || '';
          messageLog.unshift({
            jid: key.remoteJid,
            fromMe: Boolean(key.fromMe),
            text,
            pushName: message.pushName ?? '',
            at: new Date(Number(message.messageTimestamp) * 1000).toISOString(),
          });
        }
        messageLog = messageLog.slice(0, 500);
        broadcast('messages', { jid: messages[0]?.key?.remoteJid, count: messages.length });
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

  app.post('/api/whatsapp/start', (_req, res) => {
    if (connectionState.status === 'online') return res.json(connectionState);
    void startAegisWhatsApp();
    res.json({ started: true, ...connectionState });
  });

  app.get('/api/whatsapp/qr', (_req, res) => {
    if (connectionState.status === 'online') return res.json({ qr: null, status: connectionState.status, user: connectionState.user });
    if (!sock) void startAegisWhatsApp();
    // give the socket a moment to emit a QR if this is a cold start
    const wait = new Promise((resolve) => setTimeout(resolve, 2500));
    void wait.then(() => res.json({ qr: connectionState.qr, status: connectionState.status, user: connectionState.user }));
  });

  app.get('/api/whatsapp/chats', async (_req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'AEGIS WhatsApp is not connected.' });
    const store = sock.chats ?? new Map();
    const chats = [...store.entries()].map(([jid, chat]) => ({
      jid,
      name: chat?.name ?? jid.split('@')[0],
      lastMessageAt: chat?.lastMessageRecvTimestamp ?? null,
    }));
    res.json({ chats, source: 'baileys-session-store' });
  });

  app.get('/api/whatsapp/messages/:jid', (req, res) => {
    const { jid } = req.params;
    res.json({ jid, messages: messageLog.filter((item) => item.jid === jid) });
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    if (!sock || connectionState.status !== 'online') return res.status(409).json({ error: 'AEGIS WhatsApp is not connected.' });
    const { jid, text } = req.body ?? {};
    if (!jid || !text) return res.status(400).json({ error: 'jid and text are required.' });
    try {
      const result = await sock.sendMessage(jid, { text: String(text).slice(0, 4096) });
      res.json({ sent: true, id: result?.key?.id ?? null });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/whatsapp/pairing-code', async (req, res) => {
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
