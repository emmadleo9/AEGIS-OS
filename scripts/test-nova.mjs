const key = JSON.parse((await import('node:fs')).readFileSync('D:/AEGIS-OS-STORAGE/config/harvested-keys.json', 'utf8')).nvidiaApiKey;
for (const model of ['nvidia/llama-3.1-nemotron-ultra-253b-v1', 'nvidia/llama-3.1-nemotron-70b-instruct', 'meta/llama-3.2-90b-vision-instruct']) {
  const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Say NOVA ONLINE in two words.' }], max_tokens: 25, stream: false }),
  });
  const text = await r.text();
  console.log(model, '→', r.status, r.ok ? JSON.parse(text).choices?.[0]?.message?.content?.slice(0, 50) : text.slice(0, 80));
  if (r.ok) break;
}
