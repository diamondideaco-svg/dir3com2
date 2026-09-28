import { NextRequest, NextResponse } from 'next/server';
import { buildPlatformAssistantResponse, platformCurrency, platformContext, platformFamilies } from '@/lib/dabra/platform-assistant';
type AI2ChatTurn = { role: 'user' | 'assistant'; content: string };
import { createDabraAssistantTextResponse } from '@/lib/dabra/chat-response-contract';
import { validateAndNormalizeDocumentFile } from '@/lib/security/document-validation';
import { DABRA_LOCALE_ERROR, parseDabraLocale } from '@/lib/dabra/locale-contract';
import { getCurrencySnapshot } from '@/lib/currency/service';
import { parseDisplayCurrency } from '@/lib/currency/display';
export const dynamic = 'force-dynamic';

type AI2ChatRequest = {
  message?: string;
  currency?: string;
  history?: Array<{ role?: string; content?: string }>;
  mode?: 'chat' | 'travel-plan';
  stream?: boolean;
  locale?: 'ar' | 'en';
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
  if (body?.currency !== undefined && !parseDisplayCurrency(body.currency)) return NextResponse.json({ error: 'Invalid currency.' }, { status: 400 });
  const context = platformContext(modelMessage, history);
  const currency = parseDisplayCurrency(body?.currency) ?? platformCurrency(context);
  const needsRates = currency && (platformFamilies(context).includes('drive') || /trip|itinerary|رحلة|رحله/.test(context));
  const snapshot = needsRates ? await getCurrencySnapshot() : null;
  const response = buildPlatformAssistantResponse(modelMessage, history, locale, undefined, undefined, currency ? { currency, snapshot } : undefined);
  if (body?.stream === true) return createDabraAssistantTextResponse(response);
  return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
}
