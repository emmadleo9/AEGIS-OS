const OLLAMA_BASE = process.env.KRYNARA_OLLAMA_URL || 'http://127.0.0.1:11434';
const supportedModels = [
  { id: 'qwen2.5:3b', name: 'Qwen 2.5 3B' },
  { id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder 7B' },
  { id: 'orion-qwen-fast:latest', name: 'Orion Qwen Fast' },
];
const DEFAULT_MODEL = 'qwen2.5:3b';
let chatInProgress = false;

async function getAvailableModels() {
  const response = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const data = await response.json();
  const installed = new Set((Array.isArray(data.models) ? data.models : []).map((model) => model.name));
  return supportedModels.filter((model) => installed.has(model.id));
}

function localError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function generateLocalReply({ model, messages, maxTokens } = {}) {
  const selectedModel = model || DEFAULT_MODEL;
  if (chatInProgress) {
    throw localError('A local model is already responding. Wait for it to finish before sending another prompt.', 429);
  }
  if (typeof selectedModel !== 'string' || !selectedModel.trim()) {
    throw localError('Select a local chat model.', 400);
  }
  if (!Array.isArray(messages) || !messages.length) throw localError('messages required.', 400);
  if (messages.length > 8) {
    throw localError('Keep local chat history to eight messages or fewer to limit model load.', 400);
  }

  chatInProgress = true;
  try {
    const available = await getAvailableModels();
    if (!available.some((item) => item.id === selectedModel)) {
      throw localError('That model is not installed locally. Reload AI Studio and choose an installed model.', 400);
    }

    const conversation = messages.map((message) => {
      if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
        return null;
      }
      return { role: message.role, content: message.content.slice(0, 12000) };
    });
    if (conversation.some((message) => message === null)) {
      throw localError('Chat messages must have a supported role and text content.', 400);
    }

    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        messages: conversation,
        stream: false,
        keep_alive: '5m',
        options: {
          num_ctx: 4096,
          num_predict: Math.min(Math.max(Number(maxTokens) || 512, 1), 1024),
          temperature: 0.7,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw localError(data.error || `Local model failed (HTTP ${response.status}).`, 502);
    const reply = data.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      throw localError('The local model returned an empty response. Try the other installed model.', 502);
    }
    return { reply, model: data.model || selectedModel };
  } catch (error) {
    if (error?.status) throw error;
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw localError(
      timedOut
        ? 'The local model took too long to respond. Try Qwen 2.5 3B or reduce the prompt length.'
        : 'Could not reach Ollama. Make sure the local Ollama app is running.',
      timedOut ? 504 : 502,
    );
  } finally {
    chatInProgress = false;
  }
}

module.exports = {
  generateLocalReply,
  register(app, imageModels) {
    app.get('/api/nova/models', async (_req, res) => {
      try {
        const chat = await getAvailableModels();
        res.json({ chat, image: imageModels, available: chat.length > 0, provider: 'OLLAMA LOCAL · FREE' });
      } catch {
        res.json({
          chat: [],
          image: imageModels,
          available: false,
          provider: 'OLLAMA LOCAL · OFFLINE',
          error: 'Local Ollama is unavailable. Start Ollama and reload AI Studio.',
        });
      }
    });

    app.post('/api/nova/chat', async (req, res) => {
      try {
        const result = await generateLocalReply(req.body ?? {});
        return res.json(result);
      } catch (error) {
        return res.status(error?.status || 502).json({
          error: error instanceof Error ? error.message : 'Local AI request failed.',
        });
      }
    });
  },
};
