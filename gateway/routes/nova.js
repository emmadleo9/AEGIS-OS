/**
 * NOVA NEXUS relay — proxies the user's NVIDIA NIM account for chat/image/vision.
 * Image + chat requests stream back JSON; key stays server-side.
 */
const keys = require('./keys');

const NIM_BASE = 'https://integrate.api.nvidia.com/v1';

const CHAT_MODELS = [
  { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
  { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B' },
  { id: 'qwen/qwen2-72b-instruct', name: 'Qwen 2 72B' },
  { id: 'meta/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 Vision 90B', vision: true },
  { id: 'mistralai/pixtral-large-124b-instruct', name: 'Pixtral Large', vision: true },
];

const IMAGE_MODELS = [
  { id: 'black-forest-labs/flux.1-dev', name: 'Flux.1 Dev' },
  { id: 'stabilityai/sdxl-turbo', name: 'SDXL Turbo' },
  { id: 'stabilityai/stable-diffusion-3.5-large', name: 'SD 3.5 Large' },
];

module.exports = {
  CHAT_MODELS,
  IMAGE_MODELS,
  register(app) {
    app.get('/api/nova/models', (_req, res) => {
      res.json({ chat: CHAT_MODELS, image: IMAGE_MODELS, nexus: Boolean(keys.getApiKey('NV_API_KEY')) });
    });

    app.post('/api/nova/chat', async (req, res) => {
      const apiKey = keys.getApiKey('NV_API_KEY');
      if (!apiKey) return res.status(401).json({ error: 'Connect your NVIDIA NIM account in Settings first.' });
      const { model, messages, maxTokens } = req.body ?? {};
      if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages required.' });
      try {
        const response = await fetch(`${NIM_BASE}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ model: model || CHAT_MODELS[0].id, messages: messages.slice(-16), max_tokens: Math.min(Number(maxTokens) || 1024, 2048), temperature: 0.7 }),
          signal: AbortSignal.timeout(60_000),
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ error: data.detail || data.title || `NIM HTTP ${response.status}` });
        res.json({ reply: data.choices?.[0]?.message?.content ?? '', model: data.model });
      } catch (error) {
        res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    app.post('/api/nova/image', async (req, res) => {
      const apiKey = keys.getApiKey('NV_API_KEY');
      if (!apiKey) return res.status(401).json({ error: 'Connect your NVIDIA NIM account in Settings first.' });
      const { model, prompt, quality } = req.body ?? {};
      if (!prompt) return res.status(400).json({ error: 'prompt required.' });
      const sizes = { draft: '512x512', hd: '1024x1024', '4k': '1536x1536' };
      try {
        const response = await fetch(`${NIM_BASE}/infer/${model || IMAGE_MODELS[0].id}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ prompt: String(prompt).slice(0, 2000), width: sizes[quality] ? Number(sizes[quality].split('x')[0]) : 1024, height: sizes[quality] ? Number(sizes[quality].split('x')[1]) : 1024, n: 1 }),
          signal: AbortSignal.timeout(120_000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return res.status(response.status).json({ error: data.detail || data.title || `NIM HTTP ${response.status}` });
        const image = data.artifacts?.[0]?.base64 || data.image || data.b64_json || null;
        res.json({ image, seed: data.seed ?? null, model: model || IMAGE_MODELS[0].id });
      } catch (error) {
        res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    app.post('/api/nova/save', (req, res) => {
      const { kind, dataUrl, meta } = req.body ?? {};
      if (!['images', 'videos', 'audio', 'files'].includes(kind)) return res.status(400).json({ error: 'kind must be images|videos|audio|files' });
      const fs = require('node:fs');
      const dir = `D:/AEGIS-OS-STORAGE/generations/${kind}`;
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const match = String(dataUrl ?? '').match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return res.status(400).json({ error: 'dataUrl must be a base64 data URL.' });
      const [, mime, base64] = match;
      const ext = mime.split('/')[1]?.split('+')[0] || 'bin';
      const file = path.join(dir, `nova-${stamp}.${ext}`);
      fs.writeFileSync(file, Buffer.from(base64, 'base64'));
      fs.writeFileSync(`${file}.json`, JSON.stringify(meta ?? {}, null, 2));
      res.json({ saved: file });
    });

    app.get('/api/nova/gallery/:kind', (req, res) => {
      const kind = req.params.kind;
      if (!['images', 'videos', 'audio', 'files'].includes(kind)) return res.status(400).json({ error: 'bad kind' });
      const fs = require('node:fs');
      const dir = `D:/AEGIS-OS-STORAGE/generations/${kind}`;
      try {
        const files = fs.readdirSync(dir).filter((file) => !file.endsWith('.json')).slice(-60).reverse();
        res.json({ kind, files });
      } catch {
        res.json({ kind, files: [] });
      }
    });
  },
};
