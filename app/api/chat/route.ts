import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config-store';
import { askAI } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ ok: false, text: 'No prompt provided.' }, { status: 400 });
    }
    const result = await askAI(readConfig(), prompt.slice(0, 4000));
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, text: e.message || 'Request failed.' }, { status: 500 });
  }
}
