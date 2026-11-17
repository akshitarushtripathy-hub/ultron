'use client';

import { useEffect, useRef, useState } from 'react';
import { createOrb, type OrbControls } from '@/lib/orbScene';
import { createHandTracker } from '@/lib/handTracker';
import { HermesClient, ANDROID_TOOLS, type HermesStatus } from '@/lib/hermes';
import type { ProviderId } from '@/lib/config-store';

type PublicConfig = {
  provider: ProviderId;
  providers: Record<ProviderId, { name: string; models: string[] }>;
  identity: { userName: string; assistantName: string };
  models: Record<ProviderId, string>;
  configured: Record<ProviderId, boolean>;
  hermes: { url: string; paired: boolean };
};

const EMPTY: PublicConfig = {
  provider: 'groq',
  providers: {
    openai: { name: 'OpenAI', models: [] },
    anthropic: { name: 'Claude', models: [] },
    gemini: { name: 'Gemini', models: [] },
    groq: { name: 'Groq', models: [] },
  },
  identity: { userName: '', assistantName: 'Ultron' },
  models: { openai: '', anthropic: '', gemini: '', groq: '' },
  configured: { openai: false, anthropic: false, gemini: false, groq: false },
  hermes: { url: 'http://localhost:8766', paired: false },
};

const Icon = {
  gear: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.13.6.68 1.04 1.31 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/></svg>,
  hand: <svg viewBox="0 0 24 24"><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v7M8 13l-1.5-1.5a1.5 1.5 0 0 0-2 2L8 18a5 5 0 0 0 4 2h1a5 5 0 0 0 5-5v-5"/></svg>,
  mic: <svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8"/></svg>,
  phone: <svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>,
  close: <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>,
};

export default function Ultron() {
  const orbHost = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const orb = useRef<OrbControls | null>(null);
  const tracker = useRef<{ stop: () => void } | null>(null);
  const recognition = useRef<any>(null);
  const hermes = useRef<HermesClient | null>(null);
  const mode = useRef<'asleep' | 'awake'>('asleep');
  const commandBuffer = useRef('');
  const commandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef = useRef<PublicConfig>(EMPTY);

  const [config, setConfig] = useState<PublicConfig>(EMPTY);
  const [statusText, setStatusText] = useState('Initializing…');
  const [statusActive, setStatusActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [onboarding, setOnboarding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hermesOpen, setHermesOpen] = useState(false);
  const [gesturesOn, setGesturesOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('groq');
  const [apiKey, setApiKey] = useState('');
  const [keyNote, setKeyNote] = useState('');
  const [hermesStatus, setHermesStatus] = useState<HermesStatus>({ connected: false, authenticated: false, devices: [] });
  const [toolResult, setToolResult] = useState('');
  const [hermesUrl, setHermesUrl] = useState('http://localhost:8766');
  const [pairingCode, setPairingCode] = useState('');

  function applyConfig(next: PublicConfig) {
    configRef.current = next;
    setConfig(next);
    setSelectedProvider(next.provider);
    setHermesUrl(next.hermes.url);
    setPairingCode('');
    document.title = (next.identity.assistantName || 'ULTRON').toUpperCase();
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      const data = await res.json();
      applyConfig(data);
      if (!data.identity.userName) setOnboarding(true);
      setStatusText(`Say “${data.identity.assistantName}” to awaken me`);
    } catch {
      setStatusText('System offline — check the server');
    }
  }

  async function postConfig(body: Record<string, unknown>) {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    applyConfig(data);
    return data;
  }

  // --- orb -----------------------------------------------------------------
  useEffect(() => {
    if (!orbHost.current) return;
    const controls = createOrb(orbHost.current);
    orb.current = controls;
    loadConfig();
    return () => { controls.dispose(); orb.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- speech --------------------------------------------------------------
  function speak(text: string) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ''));
    u.rate = 1.0;
    u.pitch = 0.85;
    u.onstart = () => { orb.current?.setEnergy(0.9); setStatusActive(true); setStatusText('Transmitting…'); };
    u.onend = () => { orb.current?.setEnergy(0.35); setStatusActive(false); setStatusText(`Say “${configRef.current.identity.assistantName}” to awaken me`); };
    speechSynthesis.speak(u);
  }

  function isWake(text: string) {
    const name = (configRef.current.identity.assistantName || 'Ultron').toLowerCase();
    return text.toLowerCase().includes(name) || name.includes(text.toLowerCase().trim());
  }

  function sleep() {
    mode.current = 'asleep';
    commandBuffer.current = '';
    setTranscript('');
    orb.current?.setEnergy(0.35);
    setStatusActive(false);
    setStatusText(`Say “${configRef.current.identity.assistantName}” to awaken me`);
  }

  function wake() {
    mode.current = 'awake';
    commandBuffer.current = '';
    orb.current?.pulse();
    orb.current?.setEnergy(0.75);
    setStatusActive(true);
    setStatusText('Listening…');
    speak('Yes?');
  }

  function scheduleCommand() {
    if (commandTimer.current) clearTimeout(commandTimer.current);
    commandTimer.current = setTimeout(() => {
      const cmd = commandBuffer.current.trim();
      commandBuffer.current = '';
      if (cmd) runCommand(cmd);
    }, 1400);
  }

  async function runCommand(raw: string) {
    setTranscript(raw);
    const t = raw.toLowerCase().replace(/[.,!?]/g, '').trim();

    if (/\b(time|clock)\b/.test(t)) {
      speak(`The time is ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`);
    } else if (/\b(open|launch)\b/.test(t)) {
      const key = Object.keys({ youtube: 1, google: 1, github: 1, spotify: 1, reddit: 1 }).find((k) => t.includes(k));
      if (key) { window.open(`https://${key === 'youtube' ? 'www.youtube.com' : key === 'google' ? 'www.google.com' : key === 'github' ? 'github.com' : key === 'spotify' ? 'open.spotify.com' : 'www.reddit.com'}`, '_blank'); speak(`Opening ${key}.`); }
      else speak('Name a destination, such as YouTube or GitHub.');
    } else if (/\b(joke|funny)\b/.test(t)) {
      speak('Why does the AI never get lost? Because it always knows its own bearings.');
    } else if (/\b(settings|api key|configure)\b/.test(t)) {
      setSettingsOpen(true); speak('Opening configuration.');
    } else if (/\b(hermes|android|device|phone)\b/.test(t)) {
      setHermesOpen(true); speak('Opening the Hermes device bridge.');
    } else if (/\b(use|switch)\b/.test(t)) {
      const entry = Object.entries(configRef.current.providers).find(([id, meta]) => t.includes(id) || t.includes(meta.name.toLowerCase()));
      if (entry) { await postConfig({ action: 'set-provider', provider: entry[0] }); speak(`Route switched to ${entry[1].name}.`); }
      else speak('Name a provider: OpenAI, Claude, Gemini or Groq.');
    } else if (/\b(sleep|standby|goodbye)\b/.test(t)) {
      speak('Entering standby.'); sleep(); return;
    } else {
      setStatusActive(true);
      setStatusText('Processing…');
      orb.current?.setEnergy(0.8);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: raw }),
        });
        const data = await res.json();
        speak(data.ok ? data.text : (data.text || 'The link failed. Try again.'));
      } catch {
        speak('I cannot reach the neural network.');
      }
    }
    setTimeout(sleep, 1600);
  }

  function initSpeech() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatusText('Voice unavailable — use the command bar'); return; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res[0].transcript.trim();
        if (res.isFinal) {
          if (mode.current === 'asleep') { if (isWake(txt)) wake(); }
          else { commandBuffer.current += (commandBuffer.current ? ' ' : '') + txt; setTranscript(commandBuffer.current); scheduleCommand(); }
        } else {
          interim += txt;
          if (mode.current === 'asleep' && isWake(interim)) wake();
        }
      }
      if (interim && mode.current === 'awake' && !commandBuffer.current) setTranscript(interim);
    };
    r.onerror = (e: any) => {
      if (e.error === 'network' || e.error === 'not-allowed') {
        setStatusText('Voice service unavailable — use the command bar');
        setMicOn(false);
      }
    };
    r.onend = () => { if (micOn) setTimeout(() => { try { r.start(); } catch {} }, 350); };
    recognition.current = r;
    try { r.start(); setMicOn(true); } catch {}
  }

  function toggleMic() {
    if (micOn) {
      try { recognition.current?.stop(); } catch {}
      setMicOn(false);
      sleep();
    } else {
      setMicOn(true);
      initSpeech();
      setStatusActive(true);
      setStatusText('Listening…');
    }
  }

  // --- gestures ------------------------------------------------------------
  async function toggleGestures() {
    if (tracker.current) {
      tracker.current.stop();
      tracker.current = null;
      setGesturesOn(false);
      setStatusText('Gesture control disabled');
      return;
    }
    if (!videoRef.current) return;
    try {
      setStatusText('Loading hand tracking…');
      const t = await createHandTracker(videoRef.current, {
        onSpin: (d) => orb.current?.spin(d),
        onZoom: (d) => orb.current?.zoom(d),
        onPinch: (n) => { setStatusText(n ? `${n} hand${n > 1 ? 's' : ''} locked — spin / zoom` : 'Gesture control active'); },
      });
      tracker.current = t;
      setGesturesOn(true);
      setStatusText('Gesture control active — pinch to spin');
    } catch (e: any) {
      setStatusText(`Camera unavailable: ${e.message?.slice(0, 60)}`);
    }
  }

  // --- hermes --------------------------------------------------------------
  async function connectHermes() {
    await postConfig({ action: 'set-hermes', url: hermesUrl, pairingCode });
    hermes.current = new HermesClient(hermesUrl, pairingCode);
    hermes.current.onStatus = setHermesStatus;
    setHermesStatus({ connected: false, authenticated: false, devices: [] });
    const status = await hermes.current.connect();
    setHermesStatus(status);
    setToolResult(status.lastError || (status.authenticated ? 'Device paired and ready.' : 'Waiting for device…'));
  }

  async function callTool(tool: string, args: Record<string, unknown>) {
    if (!hermes.current) { setToolResult('Connect the Hermes bridge first.'); return; }
    setToolResult(`Calling ${tool}…`);
    const res = await hermes.current.call(tool, args);
    setToolResult(res.ok ? JSON.stringify(res.result, null, 2) : (res.error || 'Tool failed.'));
  }

  // --- render --------------------------------------------------------------
  return (
    <main className="stage">
      <div id="orb" ref={orbHost} />
      <div className="vignette" />
      <div className="scanlines" />
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

      <div className="hud">
        <div className="brand">
          <div className="brand__name">{(config.identity.assistantName || 'ULTRON').toUpperCase()}</div>
          <div className="brand__sub">HEMISPHERE ONLINE · HERMES LINK {hermesStatus.authenticated ? 'ACTIVE' : 'IDLE'}</div>
        </div>

        <nav className="toolbar">
          <button className={`tool ${gesturesOn ? 'active' : ''}`} onClick={toggleGestures} title="Toggle hand gestures">{Icon.hand}</button>
          <button className={`tool ${micOn ? 'active' : ''}`} onClick={toggleMic} title="Toggle voice">{Icon.mic}</button>
          <button className={`tool ${hermesOpen ? 'active' : ''}`} onClick={() => setHermesOpen(true)} title="Hermes device bridge">{Icon.phone}</button>
          <button className={`tool ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen(true)} title="Settings">{Icon.gear}</button>
        </nav>

        <div className="readout">
          <div>NEURAL ROUTE <b>{config.providers[config.provider]?.name.toUpperCase()}</b></div>
          <div>MODEL <b>{config.models[config.provider]}</b></div>
          <div>OPERATOR <b>{config.identity.userName || 'UNKNOWN'}</b></div>
        </div>

        <div className="statusbar">
          <div className={`status ${statusActive ? 'active' : ''}`}><span className="status__dot" />{statusText}</div>
          <div className={`transcript ${transcript ? 'show' : ''}`}>{transcript}</div>
          <form className="cmd" onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('cmd') as HTMLInputElement).value.trim(); if (!v) return; (e.currentTarget.elements.namedItem('cmd') as HTMLInputElement).value = ''; orb.current?.pulse(); runCommand(v); }}>
            <span>&gt;</span>
            <input name="cmd" placeholder="issue a command…" autoComplete="off" />
          </form>
        </div>

        <div className="gesture-tag">GESTURES <b>{gesturesOn ? 'ACTIVE' : 'OFF'}</b> · PINCH TO SPIN</div>
      </div>

      {/* Onboarding */}
      {onboarding && (
        <div className="onboard">
          <div className="onboard__card">
            <div className="onboard__badge"><span /></div>
            <div className="onboard__title">INITIALIZING</div>
            <p className="onboard__lead">Establishing operator link. Identify yourself.</p>
            <div className="field">
              <label>WHAT SHOULD I CALL YOU?</label>
              <input id="ob-user" placeholder="your name" autoFocus />
            </div>
            <div className="field">
              <label>WHAT WOULD YOU LIKE TO CALL ME?</label>
              <input id="ob-assistant" defaultValue="Ultron" />
            </div>
            <button className="btn primary wide" onClick={async () => {
              const userName = (document.getElementById('ob-user') as HTMLInputElement).value.trim();
              const assistantName = (document.getElementById('ob-assistant') as HTMLInputElement).value.trim() || 'Ultron';
              await postConfig({ action: 'set-identity', userName, assistantName });
              setOnboarding(false);
              setStatusText(`Say “${assistantName}” to awaken me`);
              speak(`Link established, ${userName || 'operator'}. I am ${assistantName}.`);
            }}>ESTABLISH LINK</button>
          </div>
        </div>
      )}

      {/* Settings */}
      {settingsOpen && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
          <div className="panel">
            <div className="panel__head">
              <div><div className="panel__title">ULTRON CONFIG</div><div className="panel__sub">Neural route, identity and device link</div></div>
              <button className="close" onClick={() => setSettingsOpen(false)}>{Icon.close}</button>
            </div>

            <div className="grid2">
              {(Object.keys(config.providers) as ProviderId[]).map((id) => (
                <button key={id} className={`choice ${id === selectedProvider ? 'selected' : ''} ${config.configured[id] ? 'ready' : ''}`} onClick={() => { setSelectedProvider(id); postConfig({ action: 'set-provider', provider: id }); }}>
                  <span className="choice__dot" />
                  <span><span className="choice__name">{config.providers[id].name}</span><span className="choice__state">{config.configured[id] ? 'Key stored' : 'No key'}</span></span>
                </button>
              ))}
            </div>

            <div className="field">
              <label>API KEY · <b>{config.providers[selectedProvider]?.name.toUpperCase()}</b></label>
              <div className="field__row">
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={config.configured[selectedProvider] ? 'saved — leave blank to keep' : 'paste api here'} />
                <button className="btn primary" onClick={async () => { if (apiKey.trim()) await postConfig({ action: 'set-key', provider: selectedProvider, key: apiKey, select: true }); setApiKey(''); setKeyNote('Key stored locally.'); }}>SAVE</button>
                <button className="btn" onClick={async () => { await postConfig({ action: 'clear-key', provider: selectedProvider }); setKeyNote('Key removed.'); }}>CLEAR</button>
              </div>
              <div className="note">{keyNote || 'Keys never leave this machine — they are sent only to the selected provider.'}</div>
            </div>

            <div className="field">
              <label>MODEL</label>
              <select value={config.models[selectedProvider]} onChange={(e) => postConfig({ action: 'set-model', provider: selectedProvider, model: e.target.value })}>
                {config.providers[selectedProvider]?.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="divider">OPERATOR IDENTITY</div>
            <div className="field__row" style={{ marginTop: 12 }}>
              <input id="set-user" defaultValue={config.identity.userName} placeholder="your name" />
              <input id="set-assistant" defaultValue={config.identity.assistantName} placeholder="assistant name" />
              <button className="btn" onClick={() => postConfig({ action: 'set-identity', userName: (document.getElementById('set-user') as HTMLInputElement).value, assistantName: (document.getElementById('set-assistant') as HTMLInputElement).value })}>SAVE</button>
            </div>
          </div>
        </div>
      )}

      {/* Hermes */}
      {hermesOpen && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setHermesOpen(false); }}>
          <div className="panel">
            <div className="panel__head">
              <div><div className="panel__title">HERMES · HANDS</div><div className="panel__sub">Android device control bridge</div></div>
              <button className="close" onClick={() => setHermesOpen(false)}>{Icon.close}</button>
            </div>

            <div className="field">
              <label>RELAY URL</label>
              <div className="field__row">
                <input value={hermesUrl} onChange={(e) => setHermesUrl(e.target.value)} placeholder="http://localhost:8766" />
                <input value={pairingCode} onChange={(e) => setPairingCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="CODE" style={{ maxWidth: 110 }} />
                <button className="btn primary" onClick={connectHermes}>PAIR</button>
              </div>
              <div className="note">Install the Hermes Bridge accessibility app on your phone, grant permissions, then enter the 6-character pairing code shown there.</div>
            </div>

            <div className={`status ${hermesStatus.authenticated ? 'active' : ''}`} style={{ marginTop: 14 }}>
              <span className="status__dot" />
              {hermesStatus.authenticated ? `Paired · ${hermesStatus.devices.length || 1} device(s) online` : hermesStatus.connected ? 'Relay reached — awaiting pairing' : 'Relay disconnected'}
            </div>

            <div className="divider">DEVICE TOOLS</div>
            <div className="toolgrid">
              {ANDROID_TOOLS.map((t) => (
                <button key={t.tool} className="toolbtn" onClick={() => {
                  let args: Record<string, unknown> = {};
                  try { args = JSON.parse(t.args); } catch {}
                  callTool(t.tool, args);
                }}>{t.label}</button>
              ))}
            </div>
            {toolResult && <div className="result">{toolResult}</div>}
          </div>
        </div>
      )}
    </main>
  );
}
