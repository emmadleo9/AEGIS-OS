// Step-by-step probe of the route module's start function
const mod = require('./routes/aegis-whatsapp.js');

process.on('uncaughtException', (e) => { console.log('UNCAUGHT:', e.message); });
process.on('unhandledRejection', (e) => { console.log('REJECTION:', e && e.message); });

console.log('step-1: invoking');
const p = mod.startAegisWhatsApp();
console.log('step-2: invoked, promise pending');
p.then(
  (v) => console.log('step-3: resolved with', typeof v),
  (e) => console.log('step-3: rejected', e && e.message),
);
setTimeout(() => {
  console.log('step-4 FINAL', JSON.stringify(mod.getWhatsAppState()));
  process.exit(0);
}, 15000);
