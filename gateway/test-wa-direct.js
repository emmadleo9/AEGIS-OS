// Direct reproduction of route logic, but standalone to see every event
const baileys = require('@whiskeysockets/baileys');
const path = require('node:path');
const AUTH_DIR = path.join(__dirname, 'data', 'baileys_auth');

(async () => {
  console.log('boot');
  const { state, saveCreds } = await baileys.useMultiFileAuthState(AUTH_DIR);
  const { version } = await baileys.fetchLatestBaileysVersion();
  console.log('version', version);
  const sock = baileys.default({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['AEGIS WhatsApp', 'Chrome', '1.0'],
    syncFullHistory: false,
  });
  console.log('socket created');
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    console.log('EV:', JSON.stringify({ connection: u.connection, qr: Boolean(u.qr), receivedPendingNotifications: u.receivedPendingNotifications }));
    if (u.qr) console.log('>>> QR LENGTH', u.qr.length);
  });
  setTimeout(() => { console.log('DONE waiting'); process.exit(0); }, 15000);
})();
