import { NextRequest, NextResponse } from 'next/server';
import { platformCurrency, platformContext, platformFamilies, refinePlatformTrip } from '@/lib/dabra/platform-assistant';
type AI2ChatTurn = { role: 'user' | 'assistant'; content: string };
import { createDabraAssistantTextResponse } from '@/lib/dabra/chat-response-contract';
import { validateAndNormalizeDocumentFile } from '@/lib/security/document-validation';
import { DABRA_LOCALE_ERROR, parseDabraLocale } from '@/lib/dabra/locale-contract';
import { getCurrencySnapshot } from '@/lib/currency/service';
import { parseDisplayCurrency } from '@/lib/currency/display';
import { agentIntent, type AgentContext } from '@/lib/dabra/agent-contract';
import { runInternalAgent } from '@/lib/dabra/agent';
import { parseContinuityChatTrip } from '@/lib/dabra/continuity-chat';
export const dynamic = 'force-dynamic';

type AI2ChatRequest = {
  message?: string;
  currency?: string;
  history?: Array<{ role?: string; content?: string }>;
  mode?: 'chat' | 'travel-plan';
  stream?: boolean;
  locale?: 'ar' | 'en';
  continuityTrip?: unknown;
};

type ParsedChatRequest = { body: AI2ChatRequest | null; attachmentCount: number; attachmentError: boolean };

const MAX_HISTORY_TURNS = 8;
const MAX_TURN_LENGTH = 500;
const MAX_ATTACHMENTS = 3;
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
    const body: AI2ChatRequest = { currency: typeof form.get('currency') === 'string' ? String(form.get('currency')) : undefined, message: String(form.get('message') ?? ''), history, stream, mode, locale: locale ?? undefined };
    const rawTrip = form.get('continuityTrip');
    if (rawTrip !== null) {
      try { body.continuityTrip = typeof rawTrip === 'string' ? JSON.parse(rawTrip) : null; }
      catch { body.continuityTrip = null; }
    }
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

export async function POST(request: NextRequest) {
  // Public discovery is read-only. Submission uses the existing authenticated REQ flow.
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

  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, MAX_TURN_LENGTH) : '';

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
  let trip = null;
  if (body?.continuityTrip !== undefined) {
    const input = parseContinuityChatTrip(body.continuityTrip);
    if (!input) return NextResponse.json({ error: 'Invalid continuity context.' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
    try {
      const { resolveContinuityChatTrip } = await import('@/lib/dabra/continuity-chat-server');
      trip = await resolveContinuityChatTrip(request, input);
    } catch { /* Unavailable authenticated continuity fails closed. */ }
    if (!trip) return NextResponse.json({ error: 'Continuity context expired or changed.' }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
    trip = refinePlatformTrip(trip, message);
  }
  if (body?.currency !== undefined && !parseDisplayCurrency(body.currency)) return NextResponse.json({ error: 'Invalid currency.' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  let intent = agentIntent(message);
  let agentContext: AgentContext = { role: 'guest', readRequests: async () => ({ kind: 'authentication_required' }) };
  const inferenceEnabled = process.env.DABRA_INTERNAL_AI_ENABLED === 'true';
  const publicUtility = ['weather', 'currency', 'maps'].includes(intent.tool);
  if ((intent.tool !== 'discover' && !publicUtility) || inferenceEnabled) {
    const { resolveAgentContext } = await import('@/lib/dabra/agent-context');
    agentContext = await resolveAgentContext(request);
  }
  let understanding: string = 'internal-rules';
  let understandingProvider: string | undefined;
  // Only authenticated ambiguity uses the optional classifier. It cannot read
  // records, grant roles or generate customer-facing facts/actions.
  if (inferenceEnabled && agentContext.role !== 'guest' && intent.tool === 'discover' && !platformFamilies(message).length) {
    const { planInternalAgentTool } = await import('@/lib/dabra/agent-planner');
    const planned = await planInternalAgentTool(message);
    understanding = planned.status;
    understandingProvider = planned.status === 'ok' ? planned.provider : undefined;
    if (planned.tool) intent = { ...intent, tool: planned.tool };
  }
  const context = platformContext(modelMessage, history, trip);
  const currency = parseDisplayCurrency(body?.currency) ?? platformCurrency(context);
  const needsRates = currency && !publicUtility && (intent.tool !== 'discover' || platformFamilies(context).includes('drive') || /trip|itinerary|رحلة|رحله/.test(context));
  const snapshot = needsRates ? await getCurrencySnapshot() : null;
  const response = await runInternalAgent({ message: modelMessage, history, locale, context: agentContext, intent,
    pricing: currency ? { currency, snapshot } : undefined, trip });
  if (body?.stream === true) {
    const streamed = createDabraAssistantTextResponse(response);
    streamed.headers.set('X-DABRA-Understanding', understanding);
    if (understandingProvider) streamed.headers.set('X-DABRA-Understanding-Provider', understandingProvider);
    if (intent.tool !== 'discover') streamed.headers.set('X-DABRA-Private-Context', '1');
    return streamed;
  }
  return NextResponse.json({ ...response, understanding, understandingProvider }, { headers: { 'Cache-Control': 'private, no-store' } });
}
