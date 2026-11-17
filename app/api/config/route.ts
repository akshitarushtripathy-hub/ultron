import { NextResponse } from 'next/server';
import { publicConfig, readConfig, writeConfig, PROVIDERS, type UltronConfig, type ProviderId } from '@/lib/config-store';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(publicConfig());
}

export async function POST(request: Request) {
  const body = await request.json();
  const config: UltronConfig = readConfig();
  const action = body.action as string;

  if (action === 'set-provider') {
    if (body.provider in PROVIDERS) config.provider = body.provider as ProviderId;
  } else if (action === 'set-key') {
    const p = body.provider as ProviderId;
    if (p in PROVIDERS) config.keys[p] = String(body.key || '').trim();
    if (body.select) config.provider = p;
  } else if (action === 'clear-key') {
    const p = body.provider as ProviderId;
    if (p in PROVIDERS) config.keys[p] = '';
  } else if (action === 'set-model') {
    const p = body.provider as ProviderId;
    if (p in PROVIDERS) config.models[p] = String(body.model || '').trim();
  } else if (action === 'set-identity') {
    config.identity.userName = String(body.userName || '').trim().slice(0, 60);
    config.identity.assistantName = String(body.assistantName || 'Ultron').trim().slice(0, 60) || 'Ultron';
  } else if (action === 'set-hermes') {
    config.hermes.url = String(body.url || '').trim();
    config.hermes.pairingCode = String(body.pairingCode || '').trim();
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  writeConfig(config);
  return NextResponse.json(publicConfig());
}
