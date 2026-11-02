import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadMemory, saveMemory } from '@/lib/aegis-memory';

type NovaMessage = { role: 'user' | 'nova'; text: string; at: string };
type NovaMode = 'NEXUS' | 'CORE';

/**
 * NOVA — AEGIS assistant.
 * Speaks British English ONLY (en-GB voice, never en-IN/en-PK voices).
 * Listens with Web Speech API, 'en-PK' primary and 'en-US' fallback (Pakistani/Urdu-English accent).
 * Executes console navigation commands. NEVER modifies its own source — generates only via
 * /api/nova/* endpoints that write into D:/AEGIS-OS-STORAGE/generations.
 */
const COMMANDS: Array<{ match: RegExp; run: (navigate: (to: string) => void) => string }> = [
  { match: /(open|show|go to).*(world|globe|map)/i, run: (nav) => { nav('/world'); return 'Opening World View.'; } },
  { match: /(open|show|go to).*(weather|climate)/i, run: (nav) => { nav('/weather'); return 'Opening Weather Intel.'; } },
  { match: /(open|show|go to).*(ai studio|studio|generate)/i, run: (nav) => { nav('/ai-studio'); return 'Opening AI Studio.'; } },
  { match: /(open|show|go to).*(whatsapp)/i, run: (nav) => { nav('/social'); return 'Opening AEGIS WhatsApp in the Social Hub.'; } },
  { match: /(open|show|go to).*(dashboard|home|command)/i, run: (nav) => { nav('/'); return 'Returning to Command Dashboard.'; } },
  { match: /(open|show|go to).*(news|conflict|feeds)/i, run: (nav) => { nav('/feeds'); return 'Opening News and Conflict feed.'; } },
  { match: /(open|show|go to).*(task|process|system monitor)/i, run: (nav) => { nav('/'); return 'Opening the Task Control Center on the dashboard.'; } },
  { match: /(open|show|go to).*(settings|api|keys)/i, run: (nav) => { nav('/settings'); return 'Opening Settings — connect your accounts there.'; } },
];

function pickBritishVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang === 'en-GB' && /google uk english female/i.test(voice.name))
    ?? voices.find((voice) => voice.lang === 'en-GB')
    ?? voices.find((voice) => /british/i.test(voice.name))
    ?? null;
}

export function NovaAssistant() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<NovaMode>('NEXUS');
  const [messages, setMessages] = useState<NovaMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const navigate = useNavigate();
  const recognitionRef = useRef<any>(null);
  const messagesRef = useRef<NovaMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => { void loadMemory<NovaMessage[]>('chats', []).then((stored) => setMessages(stored.slice(-30))); }, []);
  useEffect(() => { if (messages.length) void saveMemory('chats', messages.slice(-50)); }, [messages]);

  useEffect(() => {
    const warm = () => { setVoiceReady(Boolean(pickBritishVoice())); };
    warm();
    speechSynthesis.onvoiceschanged = warm;
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, []);

  const speak = useCallback((text: string) => {
    if (!text) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickBritishVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = 'en-GB'; // HARD LOCK: British accent only
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
  }, []);

  const askNexus = useCallback(async (prompt: string): Promise<string> => {
    try {
      const response = await fetch('/api/nova/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are NOVA, the assistant of AEGIS-OS, a tactical command console. Answer briefly, precisely, with a calm British tone. You may generate text and code, but you must NEVER modify your own source code.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      const data = await response.json() as { reply?: string; error?: string };
      return data.reply || data.error || 'NEXUS returned no reply.';
    } catch (error) {
      return `NEXUS unreachable: ${error instanceof Error ? error.message : String(error)}`;
    }
  }, []);

  const askCore = useCallback((prompt: string): string => {
    // NOVA CORE — offline mode. Deterministic local replies; no network, no code self-edit.
    const command = COMMANDS.find(({ match }) => match.test(prompt));
    if (command) return command.run(navigate);
    return `CORE offline mode: I can navigate the console (say "open world view" or "open whatsapp"). Full reasoning returns when NEXUS is connected in Settings.`;
  }, [navigate]);

  const handle = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    setMessages((current) => [...current, { role: 'user', text: prompt, at: new Date().toISOString() }]);
    const command = COMMANDS.find(({ match }) => match.test(prompt));
    const reply = command ? command.run(navigate) : mode === 'NEXUS' ? await askNexus(prompt) : askCore(prompt);
    setMessages((current) => [...current, { role: 'nova', text: reply, at: new Date().toISOString() }]);
    speak(reply);
  }, [askCore, askNexus, mode, navigate, speak]);

  const toggleListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages((current) => [...current, { role: 'nova', text: 'This browser has no Web Speech API. Use Chrome or Edge.', at: new Date().toISOString() }]);
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-PK'; // Pakistani / Urdu-English accent first
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript as string;
      void handle(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }, [handle, listening]);

  return (
    <>
      <button
        type="button"
        className="nova-orb"
        aria-label={open ? 'Close NOVA' : 'Open NOVA assistant'}
        onClick={() => setOpen((value) => !value)}
        data-speaking={speaking || undefined}
      >
        {open ? '×' : '◈'}
      </button>
      {open && (
        <div className="nova-panel" role="dialog" aria-label="NOVA assistant">
          <div className="nova-head">
            <strong>NOVA {mode}</strong>
            <div className="nova-mode-switch">
              <button type="button" className={mode === 'NEXUS' ? 'active' : ''} onClick={() => setMode('NEXUS')}>NEXUS</button>
              <button type="button" className={mode === 'CORE' ? 'active' : ''} onClick={() => setMode('CORE')}>CORE</button>
            </div>
          </div>
          <div className="nova-messages">
            {messages.length === 0 && <p className="inline-status">Say "open world view", "open whatsapp" or ask anything. Voice: British · Listening: en-PK.</p>}
            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'chat-bubble outgoing' : 'chat-bubble'}>
                <div>{message.text}</div>
                <time>{message.role === 'user' ? 'YOU' : 'NOVA'} · {new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
            ))}
          </div>
          <div className="nova-input-row">
            <button type="button" className={`nova-mic${listening ? ' live' : ''}`} aria-label={listening ? 'Stop listening' : 'Start listening'} onClick={toggleListening}>
              {listening ? '◉' : '🎙'}
            </button>
            <form onSubmit={(event) => { event.preventDefault(); const text = draft; setDraft(''); void handle(text); }}>
              <input aria-label="Message NOVA" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={mode === 'NEXUS' ? 'Ask NOVA NEXUS…' : 'Command NOVA CORE…'} />
            </form>
            <button type="button" className="hud-button" onClick={() => { const last = [...messages].reverse().find((message) => message.role === 'nova'); if (last) speak(last.text); }} disabled={!voiceReady && !speaking}>
              ▶
            </button>
          </div>
          <p className="nova-foot">{voiceReady ? 'EN-GB VOICE LOCKED' : 'BRITISH VOICE LOADING…'} · GENERATIONS → D:\AEGIS-OS-STORAGE</p>
        </div>
      )}
    </>
  );
}
