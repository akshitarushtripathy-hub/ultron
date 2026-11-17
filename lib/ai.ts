import { PROVIDERS, type ProviderId, type UltronConfig } from './config-store';
import { systemPrompt } from './ultron-db';

async function call(url: string, options: RequestInit): Promise<any> {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  const body = await res.text();
  let data: any = null;
  try { data = JSON.parse(body); } catch { /* non-JSON */ }
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || body.slice(0, 160) || `HTTP ${res.status}`);
  }
  return data;
}

export async function askAI(config: UltronConfig, prompt: string): Promise<{ ok: boolean; text: string; provider?: string; model?: string }> {
  const provider = config.provider;
  const key = (config.keys[provider] || '').trim();
  if (!key) return { ok: false, text: `No API key configured for ${PROVIDERS[provider].name}. Open settings to add one.` };

  const model = config.models[provider] || PROVIDERS[provider].models[0];
  const system = systemPrompt(config.identity.userName);

  try {
    let text = '';

    if (provider === 'openai' || provider === 'groq') {
      const url = provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.groq.com/openai/v1/chat/completions';
      const data = await call(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
          max_tokens: 220,
          temperature: 0.75,
        }),
      });
      text = data?.choices?.[0]?.message?.content || '';
    }

    else if (provider === 'anthropic') {
      const data = await call('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 220,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      text = (data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ');
    }

    else if (provider === 'gemini') {
      const data = await call(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 220, temperature: 0.75 },
          }),
        }
      );
      text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join(' ');
    }

    text = String(text || '').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim();
    return text
      ? { ok: true, text, provider, model }
      : { ok: false, text: `${PROVIDERS[provider].name} returned an empty response.` };
  } catch (e: any) {
    return { ok: false, text: `${PROVIDERS[provider].name}: ${e.message}` };
  }
}
