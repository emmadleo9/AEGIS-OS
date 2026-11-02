// compare: does requiring baileys FIRST via destructuring change anything?
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('node:path');
const AUTH_DIR = path.join(__dirname, 'data', 'baileys_auth');

(async () => {
  console.log('boot destructure-style');
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, browser: ['AEGIS WhatsApp', 'Chrome', '1.0'], syncFullHistory: false });
  console.log('socket created');
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    console.log('EV:', JSON.stringify({ connection: u.connection, qr: Boolean(u.qr) }));
    if (u.qr) { console.log('QR LENGTH', u.qr.length); }
  });
  setTimeout(() => { console.log('DONE'); process.exit(0); }, 15000);
})();
