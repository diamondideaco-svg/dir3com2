import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  consumeDabraVoiceRateLimit,
  DABRA_VOICE_PROFILE,
  DABRA_VOICE_REQUEST_CANCELLED,
  DabraVoiceProviderError,
  parseDabraVoiceInput,
} from '@/lib/dabra/voice-provider';
import { createMistralVoiceProvider, getMistralVoiceConfig, isMistralVoiceConfigured } from '@/lib/dabra/mistral-voice-provider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

function cancelledResponse() {
  return NextResponse.json(
    { error: { code: DABRA_VOICE_REQUEST_CANCELLED } },
    { status: 499, headers: PRIVATE_HEADERS },
  );
}

export async function GET() {
  return NextResponse.json(
    { available: isMistralVoiceConfigured(), locales: ['ar', 'en'] },
    { headers: PRIVATE_HEADERS },
  );
}

export async function POST(request: NextRequest) {
  if (request.signal.aborted) return cancelledResponse();
  const config = getMistralVoiceConfig();
  if (!config) {
    return NextResponse.json({ error: { code: 'VOICE_PROVIDER_UNAVAILABLE' } }, { status: 503, headers: PRIVATE_HEADERS });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    if (request.signal.aborted) return cancelledResponse();
    return NextResponse.json({ error: { code: 'VOICE_REQUEST_INVALID' } }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (request.signal.aborted) return cancelledResponse();
  const input = parseDabraVoiceInput(body);
  if (!input) {
    return NextResponse.json({ error: { code: 'VOICE_REQUEST_INVALID' } }, { status: 400, headers: PRIVATE_HEADERS });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (request.signal.aborted) return cancelledResponse();
    if (error || !user) {
      return NextResponse.json({ error: { code: 'VOICE_AUTH_REQUIRED' } }, { status: 401, headers: PRIVATE_HEADERS });
    }
    if (request.signal.aborted) return cancelledResponse();
    if (!consumeDabraVoiceRateLimit(user.id)) {
      return NextResponse.json(
        { error: { code: 'VOICE_RATE_LIMITED' } },
        { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': '60' } },
      );
    }

    const requestId = crypto.randomUUID();
    if (request.signal.aborted) return cancelledResponse();
    const result = await createMistralVoiceProvider(config).synthesize({
      text: input.text,
      locale: input.locale,
      voiceProfile: DABRA_VOICE_PROFILE,
      requestId,
      signal: request.signal,
    });
    return new NextResponse(result.audio, {
      headers: {
        ...PRIVATE_HEADERS,
        'Content-Type': result.contentType,
        'Content-Length': String(result.audio.byteLength),
      },
    });
  } catch (error) {
    const code = error instanceof DabraVoiceProviderError ? error.code : 'VOICE_PROVIDER_UNAVAILABLE';
    const status = code === DABRA_VOICE_REQUEST_CANCELLED ? 499 : code === 'VOICE_REQUEST_INVALID' ? 400 : 503;
    return NextResponse.json({ error: { code } }, { status, headers: PRIVATE_HEADERS });
  }
}
