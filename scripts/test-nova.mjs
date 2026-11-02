const key = JSON.parse((await import('node:fs')).readFileSync('D:/AEGIS-OS-STORAGE/config/harvested-keys.json', 'utf8')).nvidiaApiKey;
const chatId = 'nvidia/llama-3.1-nemotron-ultra-253b-v1';
const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ model: chatId, messages: [{ role: 'user', content: 'Say NOVA ONLINE.' }], max_tokens: 30, stream: false }),
});
const text = await r.text();
console.log(r.status, '|', text.slice(0, 300));
