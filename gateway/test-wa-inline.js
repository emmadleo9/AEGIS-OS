// minimal repro of route module logic inline (no imports of route file)
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('node:path');
const QRCode = require('qrcode');
const AUTH_DIR = path.join(__dirname, 'data', 'baileys_auth');
let state2 = { status: 'offline', qr: null };

(async () => {
  console.log('boot inline');
  const auth = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: auth.state, printQRInTerminal: false, browser: ['AEGIS WhatsApp', 'Chrome', '1.0'], syncFullHistory: false });
  sock.ev.on('creds.update', auth.saveCreds);
  sock.ev.on('connection.update', (u) => {
    console.log('EV', JSON.stringify({ connection: u.connection, qr: Boolean(u.qr) }));
    if (u.qr) {
      QRCode.toDataURL(u.qr, { margin: 1, width: 512 }).then((d) => {
        state2 = { status: 'waiting_qr', qr: d };
        console.log('QR ENCODED len', d.length);
      });
    }
  });
  setTimeout(() => { console.log('FINAL', JSON.stringify({ status: state2.status, qrLen: state2.qr ? state2.qr.length : 0 })); process.exit(0); }, 15000);
})();
