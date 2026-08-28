import { NextRequest, NextResponse } from 'next/server';
import { buildAI2ChatResponse, type AI2ChatAccountContext, type AI2ChatTurn } from '@/lib/ai2/runtime/chat';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DabraTravelOrchestrator } from '@/lib/ai2/orchestration';
import { TravelProviderError } from '@/lib/travel/errors';
import { createDabraAssistantTextResponse } from '@/lib/dabra/chat-response-contract';
import { validateAndNormalizeDocumentFile } from '@/lib/security/document-validation';
import { DABRA_LOCALE_ERROR, parseDabraLocale, type DabraLocale } from '@/lib/dabra/locale-contract';
import { ensureDabraResponseLocale } from '@/lib/dabra/response-language';

export const dynamic = 'force-dynamic';

type AI2ChatRequest = {
  message?: string;
  history?: Array<{ role?: string; content?: string }>;
  mode?: 'chat' | 'travel-plan';
  stream?: boolean;
  locale?: 'ar' | 'en';
};

type ParsedChatRequest = { body: AI2ChatRequest | null; attachmentCount: number; attachmentError: boolean };

type AI2RequestIdentity = {
  account?: AI2ChatAccountContext;
  scope?: { ownerId: string; tenantId: string };
};

const MAX_HISTORY_TURNS = 8;
const MAX_TURN_LENGTH = 500;
const MAX_ATTACHMENTS = 3;

async function buildLocaleSafeResponse(
  message: string,
  history: AI2ChatTurn[],
  account: AI2ChatAccountContext | undefined,
  locale: DabraLocale,
) {
  const response = await buildAI2ChatResponse(message, history, account, locale);
  return ensureDabraResponseLocale(response, locale, async (invalidAnswer) => {
    const repairInstruction = locale === 'ar'
      ? `أعد صياغة النص التالي بالعربية فقط مع إبقاء أسماء المدن والمطارات والعلامات التجارية كما هي. لا تضف معلومات جديدة:\n\n${invalidAnswer.slice(0, 1500)}`
      : `Rewrite the following text in English only, preserving city, airport, and brand names. Do not add new information:\n\n${invalidAnswer.slice(0, 1500)}`;
    return buildAI2ChatResponse(repairInstruction, [], account, locale);
  });
}

async function parseChatRequest(request: NextRequest): Promise<ParsedChatRequest> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    try { return { body: (await request.json()) as AI2ChatRequest, attachmentCount: 0, attachmentError: false }; }
    catch { return { body: null, attachmentCount: 0, attachmentError: false }; }
  }
  try {
    const form = await request.formData();
    const streamValue = form.get('stream');
    const rawHistory = form.get('history');
    let history: AI2ChatRequest['history'];
    if (typeof rawHistory === 'string') {
      try { history = JSON.parse(rawHistory) as AI2ChatRequest['history']; } catch { history = []; }
    }
    const stream = streamValue === 'true' ? true : streamValue === 'false' || streamValue === null ? undefined : streamValue as unknown as boolean;
    const modeValue = form.get('mode');
    const mode = modeValue === 'chat' || modeValue === 'travel-plan' ? modeValue : undefined;
    const localeValue = form.get('locale');
    const locale = parseDabraLocale(localeValue);
    const body: AI2ChatRequest = { message: String(form.get('message') ?? ''), history, stream, mode, locale: locale ?? undefined };
    const files = form.getAll('attachment');
    if (files.length > MAX_ATTACHMENTS || files.some((item) => !(item instanceof File))) return { body, attachmentCount: 0, attachmentError: true };
    const seen = new Set<string>();
    for (const item of files) {
      const validated = await validateAndNormalizeDocumentFile(item);
      if (!validated.ok) return { body, attachmentCount: 0, attachmentError: true };
      const digestInput = Uint8Array.from(validated.data.bytes).buffer;
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      seen.add(digest);
    }
    return { body, attachmentCount: seen.size, attachmentError: false };
  } catch {
    return { body: null, attachmentCount: 0, attachmentError: true };
  }
}

function sanitizeHistory(raw: AI2ChatRequest['history']): AI2ChatTurn[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is { role: string; content: string } =>
      Boolean(entry) && (entry?.role === 'user' || entry?.role === 'assistant') && typeof entry?.content === 'string' && entry.content.trim().length > 0,
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((entry) => ({ role: entry.role as AI2ChatTurn['role'], content: entry.content.trim().slice(0, MAX_TURN_LENGTH) }));
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.includes('auth-token') || cookie.name.startsWith('sb-'));
}

// V7: zero added latency for the anonymous path; only resolves a session (and only a safe display name) when a plausible auth cookie is present.
async function resolveSafeRequestIdentity(request: NextRequest): Promise<AI2RequestIdentity> {
  if (!hasSupabaseSessionCookie(request)) return {};

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return {};

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name = [metadata.full_name_ar, metadata.full_name, metadata.name].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    const tenantId = [metadata.tenant_id, metadata.organization_id].find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? user.id;
    return {
      account: { displayName: name ? name.trim().slice(0, 60) : null },
      scope: { ownerId: user.id, tenantId: tenantId.slice(0, 128) },
    };
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  // Public floating DABRA chat: no auth/pilot lookup on this hot path, general
  // conversational inference must never require pilot authorization.
  const parsed = await parseChatRequest(request);
  const { body } = parsed;
  const locale = parseDabraLocale(body?.locale) ?? (/[؀-ۿ]/u.test(body?.message ?? '') ? 'ar' : 'en');

  if (body?.locale !== undefined && !parseDabraLocale(body.locale)) {
    return NextResponse.json({ error: 'Invalid locale.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  if (body?.stream !== undefined && typeof body.stream !== 'boolean') {
    return NextResponse.json(
      { error: 'Invalid stream mode.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (parsed.attachmentError) {
    if (body?.stream === true) return createDabraAssistantTextResponse(null, { status: 400, fallback: DABRA_LOCALE_ERROR[locale] });
    return NextResponse.json({ error: 'Invalid attachment.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const message = body?.message?.trim().slice(0, MAX_TURN_LENGTH);
  const modelMessage = message && parsed.attachmentCount
    ? `${message}\n\n${locale === 'ar' ? `[أرفق المستخدم ${parsed.attachmentCount} ملفًا تحقق الخادم من سلامة نوعه. محتوى الملفات غير مُرسل إلى مزود الذكاء الاصطناعي، فلا تدّعِ قراءته.]` : `[The user attached ${parsed.attachmentCount} server-validated file(s). Their contents are not sent to the AI provider, so do not claim to have read them.]`}`
    : message ?? '';

  if (!message) {
    if (body?.stream === true) {
      return createDabraAssistantTextResponse(null, { status: 400, fallback: DABRA_LOCALE_ERROR[locale] });
    }
    return NextResponse.json(
      {
        error: 'Message is required.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const history = sanitizeHistory(body?.history);
  const identity = await resolveSafeRequestIdentity(request);
  if (body?.mode === 'travel-plan' && !identity.scope) {
    if (body.stream === true) {
      return createDabraAssistantTextResponse(null, { status: 401, fallback: DABRA_LOCALE_ERROR[locale] });
    }
    return NextResponse.json(
      { error: 'Authentication is required for user-scoped travel planning.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (body?.mode === 'travel-plan' && identity.scope) {
    let travel;
    try {
      travel = await new DabraTravelOrchestrator().orchestrate(modelMessage, identity.scope);
    } catch (error) {
      if (error instanceof TravelProviderError && error.code === 'INVALID_TRAVELER_COUNT') {
        if (body.stream === true) {
          return createDabraAssistantTextResponse(null, { status: 400, fallback: DABRA_LOCALE_ERROR[locale] });
        }
        return NextResponse.json(
          { error: 'Traveler counts are invalid.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      throw error;
    }
    const response = await buildLocaleSafeResponse(modelMessage, history, identity.account, locale);
    if (body.stream === true) return createDabraAssistantTextResponse(response);
    return NextResponse.json({ ...response, travel }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const response = await buildLocaleSafeResponse(modelMessage, history, identity.account, locale);
  if (body?.stream === true) {
    return createDabraAssistantTextResponse(response);
  }
  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
