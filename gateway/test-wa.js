console.log('boot route test 2');
const mod = require('./routes/aegis-whatsapp.js');
console.log('module keys:', Object.keys(mod).join(','));
console.log('has startAegisWhatsApp:', typeof mod.startAegisWhatsApp);
const result = mod.startAegisWhatsApp();
console.log('invoke returned:', result && result.then ? 'promise' : result);
result.then(() => {
  console.log('resolved');
});
setTimeout(() => {
  console.log('FINAL', JSON.stringify(mod.getWhatsAppState()));
  process.exit(0);
}, 15000);
