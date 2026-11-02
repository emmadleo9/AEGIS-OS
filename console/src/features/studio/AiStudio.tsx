import { useCallback, useEffect, useRef, useState } from 'react';
import { HudFrame } from '@/components/hud';

type ChatModel = { id: string; name: string; vision?: boolean };
type ImageModel = { id: string; name: string };
type Mode = 'CHAT' | 'IMAGE' | 'CODE';
type Quality = 'draft' | 'hd' | '4k';
type GalleryFile = { url: string; at: string; prompt: string };

const QUALITY_LABEL: Record<Quality, string> = { draft: 'DRAFT', hd: 'HD', '4k': '4K' };

export function AiStudio() {
  const [models, setModels] = useState<{ chat: ChatModel[]; image: ImageModel[]; nexus: boolean }>({ chat: [], image: [], nexus: false });
  const [mode, setMode] = useState<Mode>('CHAT');
  const [quality, setQuality] = useState<Quality>('hd');
  const [selected, setSelected] = useState('');
  const [prompt, setPrompt] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'user' | 'nova'; text: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gallery, setGallery] = useState<string[]>([]);
  const [imageData, setImageData] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch('/api/nova/models').then((response) => response.json()).then((data: typeof models) => {
      setModels(data);
      setSelected(data.chat[0]?.id ?? '');
    }).catch(() => setError('Gateway unreachable — NOVA needs the local gateway.'));
  }, []);

  useEffect(() => { if (mode === 'IMAGE') void fetch('/api/nova/gallery/images').then((r) => r.json()).then((d: { files?: string[] }) => setGallery(d.files ?? [])); }, [mode, imageData]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const runChat = useCallback(async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setPrompt('');
    setError('');
    setChat((current) => [...current, { role: 'user', text }]);
    setBusy(true);
    try {
      if (models.nexus) {
        const response = await fetch('/api/nova/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selected, messages: [...chat.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })), { role: 'user', content: text }] }),
        });
        const data = await response.json() as { reply?: string; error?: string };
        setChat((current) => [...current, { role: 'nova', text: data.reply ?? data.error ?? '(no reply)' }]);
      } else {
        // NOVA CORE fallback — code scaffolding generation only, saved to D:
        const isCode = /code|function|component|script/i.test(text);
        const scaffold = isCode
          ? `// NOVA CORE offline scaffold — ${text}\n// Saved to D:/AEGIS-OS-STORAGE/generations/files — connect NVIDIA NIM in Settings for full generation.\nexport function generated() {\n  // TODO: ${text}\n}\n`
          : 'CORE offline: connect your NVIDIA NIM account in Settings for full NEXUS reasoning. I can still navigate the console via NOVA orb.';
        setChat((current) => [...current, { role: 'nova', text: scaffold }]);
        if (isCode) {
          await fetch('/api/nova/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'files', dataUrl: `data:text/plain;base64,${btoa(scaffold)}`, meta: { prompt: text, mode: 'CORE' } }),
          });
        }
      }
    } finally {
      setBusy(false);
    }
  }, [busy, chat, models.nexus, prompt, selected]);

  const runImage = useCallback(async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/nova/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selected || models.image[0]?.id, prompt: text, quality }),
      });
      const data = await response.json() as { image?: string | null; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.image) {
        const dataUrl = data.image.startsWith('data:') ? data.image : `data:image/png;base64,${data.image}`;
        setImageData(dataUrl);
        await fetch('/api/nova/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'images', dataUrl, meta: { prompt: text, quality, model: selected } }),
        });
      } else {
        throw new Error('NIM returned no image.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [busy, models.image, prompt, quality, selected]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <HudFrame title="AI STUDIO // NOVA CONTROL">
        <div className="studio-toolbar">
          {(['CHAT', 'IMAGE', 'CODE'] as Mode[]).map((item) => (
            <button type="button" key={item} className={mode === item ? 'device-tab active' : 'device-tab'} onClick={() => { setMode(item); setSelected(item === 'IMAGE' ? models.image[0]?.id ?? '' : models.chat[0]?.id ?? ''); }}>
              {item === 'CHAT' ? 'CHAT' : item === 'IMAGE' ? 'IMAGE GEN' : 'CODE GEN'}
            </button>
          ))}
          <div className="studio-quality">
            {(['draft', 'hd', '4k'] as Quality[]).map((item) => (
              <button type="button" key={item} className={quality === item ? 'device-tab active' : 'device-tab'} onClick={() => setQuality(item)}>{QUALITY_LABEL[item]}</button>
            ))}
          </div>
          <span className={`status-dot${models.nexus ? '' : ' status-dot-offline'}`} />
          <small className="hud-label">{models.nexus ? 'NOVA NEXUS · NVIDIA NIM' : 'NOVA CORE · OFFLINE'}</small>
        </div>
        {!models.nexus && <p className="credential-notice">NOVA CORE active. Connect YOUR NVIDIA account in Settings → NVIDIA NIM to unlock Llama 405B, Flux.1, SD 3.5 and vision models.</p>}
      </HudFrame>

      <div className="feeds-layout">
        <HudFrame title={mode === 'IMAGE' ? 'GENERATION CANVAS' : 'CONSOLE'}>
          {mode === 'IMAGE' ? (
            <div className="studio-canvas">
              {imageData
                ? <img src={imageData} alt="Generated" className="studio-image" />
                : <div className="studio-placeholder">SELECT AN IMAGE MODEL BELOW · QUALITY {QUALITY_LABEL[quality]}</div>}
              {error && <p className="inline-status" style={{ color: '#ff8792' }}>{error}</p>}
              <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); void runImage(); }}>
                <input aria-label="Image prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the image… (saved to D:/AEGIS-OS-STORAGE/generations/images)" />
                <button className="hud-button" type="submit" disabled={busy}>{busy ? 'GENERATING…' : 'GENERATE'}</button>
              </form>
            </div>
          ) : (
            <>
              <div className="chat-messages" aria-live="polite">
                {chat.map((message, index) => (
                  <div key={index} className={message.role === 'user' ? 'chat-bubble outgoing' : 'chat-bubble'}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
                    <time>{message.role === 'user' ? 'YOU' : 'NOVA'}</time>
                  </div>
                ))}
                {chat.length === 0 && <p className="inline-status">{mode === 'CODE' ? 'Describe the code or file you need — outputs save to generations/files.' : 'Chat with NOVA. Vision models understand images too.'}</p>}
                <div ref={chatEndRef} />
              </div>
              <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); void runChat(); }}>
                <input aria-label="Prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === 'CODE' ? 'Describe code to generate…' : 'Message NOVA…'} />
                <button className="hud-button" type="submit" disabled={busy}>{busy ? 'THINKING…' : 'SEND'}</button>
              </form>
            </>
          )}
        </HudFrame>

        <div style={{ display: 'grid', gap: 16 }}>
          <HudFrame title="MODELS // MY NVIDIA ACCOUNT">
            <div className="studio-model-grid">
              {(mode === 'IMAGE' ? models.image : models.chat).map((model) => (
                <button type="button" key={model.id} className={`studio-model${selected === model.id ? ' selected' : ''}`} onClick={() => setSelected(model.id)}>
                  <strong>{model.name}</strong>
                  <small>{'vision' in model && model.vision ? 'VISION' : mode === 'IMAGE' ? 'IMAGE' : 'CHAT'}</small>
                </button>
              ))}
              {(mode === 'IMAGE' ? models.image : models.chat).length === 0 && <p className="inline-status">Loading NVIDIA NIM catalogue…</p>}
            </div>
          </HudFrame>
          <HudFrame title="GALLERY // D:\\GENERATIONS">
            <div className="studio-gallery">
              {gallery.map((file) => (
                <img key={file} src={`/generations/images/${file}`} alt={file} className="studio-thumb" loading="lazy" />
              ))}
              {gallery.length === 0 && <p className="inline-status">Gallery empty — generations persist on Disk D.</p>}
            </div>
          </HudFrame>
        </div>
      </div>
    </div>
  );
}
