const key = JSON.parse((await import('node:fs')).readFileSync('D:/AEGIS-OS-STORAGE/config/harvested-keys.json', 'utf8')).nvidiaApiKey;
const r = await fetch('http://127.0.0.1:2785/api/nova/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'meta/llama-3.1-405b-instruct', messages: [{ role: 'user', content: 'Say NOVA ONLINE in two words.' }] }),
});
const d = await r.json();
console.log('status:', r.status, '| reply:', d.reply ?? JSON.stringify(d).slice(0, 150));
