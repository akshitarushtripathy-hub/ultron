import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'groq';

export type UltronConfig = {
  provider: ProviderId;
  identity: { userName: string; assistantName: string };
  models: Record<ProviderId, string>;
  keys: Record<ProviderId, string>;
  hermes: { url: string; pairingCode: string };
};

export const PROVIDERS: Record<ProviderId, { name: string; models: string[] }> = {
  openai: { name: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] },
  anthropic: { name: 'Claude', models: ['claude-3-5-haiku-latest', 'claude-sonnet-4-5'] },
  gemini: { name: 'Gemini', models: ['gemini-2.0-flash', 'gemini-2.5-flash'] },
  groq: { name: 'Groq', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
};

const DEFAULTS: UltronConfig = {
  provider: 'groq',
  identity: { userName: '', assistantName: 'Ultron' },
  models: {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    gemini: 'gemini-2.0-flash',
    groq: 'llama-3.3-70b-versatile',
  },
  keys: { openai: '', anthropic: '', gemini: '', groq: '' },
  hermes: { url: 'http://localhost:8766', pairingCode: '' },
};

const DIR = path.join(os.homedir(), '.ultron');
const FILE = path.join(DIR, 'config.json');

export function readConfig(): UltronConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<UltronConfig>;
    return {
      provider: raw.provider && raw.provider in PROVIDERS ? raw.provider : DEFAULTS.provider,
      identity: { ...DEFAULTS.identity, ...(raw.identity || {}) },
      models: { ...DEFAULTS.models, ...(raw.models || {}) },
      keys: { ...DEFAULTS.keys, ...(raw.keys || {}) },
      hermes: { ...DEFAULTS.hermes, ...(raw.hermes || {}) },
    };
  } catch {
    return {
      provider: DEFAULTS.provider,
      identity: { ...DEFAULTS.identity },
      models: { ...DEFAULTS.models },
      keys: { ...DEFAULTS.keys },
      hermes: { ...DEFAULTS.hermes },
    };
  }
}

export function writeConfig(config: UltronConfig): UltronConfig {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  return config;
}

export function publicConfig() {
  const c = readConfig();
  return {
    provider: c.provider,
    providers: PROVIDERS,
    identity: c.identity,
    models: c.models,
    configured: Object.fromEntries(
      (Object.keys(c.keys) as ProviderId[]).map((k) => [k, Boolean(c.keys[k])])
    ) as Record<ProviderId, boolean>,
    hermes: { url: c.hermes.url, paired: Boolean(c.hermes.pairingCode) },
  };
}
