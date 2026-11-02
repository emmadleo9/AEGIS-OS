// minimal: copy ONLY the start function from the route file and run it standalone
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const AUTH_DIR = path.join(__dirname, 'data', 'baileys_auth');
let sock = null;
let startingPromise = null;
let connectionState = { status: 'offline', qr: null, user: null, lastError: null, updatedAt: new Date().toISOString() };

function setState(patch) {
  connectionState = { ...connectionState, ...patch, updatedAt: new Date().toISOString() };
  process.stdout.write(`[wa] setState -> ${connectionState.status}${connectionState.qr ? ' (qr)' : ''}\n`);
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
        console.log('[wa] connection.update:', JSON.stringify({ connection: update.connection, qr: Boolean(update.qr) }));
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          QRCode.toDataURL(qr, { margin: 1, width: 512 })
            .then((qrDataUrl) => setState({ status: 'waiting_qr', qr: qrDataUrl, lastError: null }))
            .catch((error) => setState({ status: 'error', lastError: `QR encode failed: ${error.message}` }));
        }
        if (connection === 'connecting') setState({ status: 'connecting', qr: null });
        if (connection === 'open') setState({ status: 'online', qr: null, user: sock?.user ?? null });
      });
      setState({ status: 'connecting', qr: null, lastError: null });
 colleg    } catch (error) {
      setState({ status: 'error', lastError: error instanceof Error ? error.message : String(error) });
    } finally {
      startingPromise = null;
    }
  });
  return startingPromise;
}

startAegisWhatsApp().then(() => { console.log('outer resolved'); });
setTimeout(() => { console.log('FINAL', JSON.stringify({ status: connectionState.status, qrLen: connectionState.qr ? connectionState.qr.length : 0 })); process.exit(0); }, 15000);
