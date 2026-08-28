import { NextRequest, NextResponse } from 'next/server';
import { authorizePilotUser } from '@/lib/auth/pilot';
import {
  SandboxError,
  resolveSandboxEnvironment,
  sandboxAvailability,
  sandboxCancelBooking,
  sandboxCompare,
  sandboxCreateBooking,
  sandboxEscalateBooking,
  sandboxModifyBooking,
  sandboxQuote,
  sandboxSearch,
} from '@/lib/ai2/sandbox/service';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTrustedSandboxAutomation, normalizeString, toClientErrorMessage } from '@/lib/ai2/sandbox/http-helpers';

export const dynamic = 'force-dynamic';

const MAX_PROMPT_INPUT = 3000;

type SandboxAction =
  | 'search'
  | 'guard'
  | 'compare'
  | 'availability'
  | 'quote'
  | 'create-booking'
  | 'modify-booking'
  | 'cancel-booking'
  | 'escalate-booking';

function readIsoDate(value: unknown) {
  const date = normalizeString(value, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new SandboxError('INVALID_DATE');
  }
  return date;
}

function readGuests(value: unknown, fallback = 1) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    throw new SandboxError('INVALID_GUESTS');
  }
  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > 12) {
    throw new SandboxError('INVALID_GUESTS');
  }
  return normalized;
}

function normalizeAction(value: unknown): SandboxAction | null {
  const action = String(value || '').trim().toLowerCase() as SandboxAction;
  const allowed: SandboxAction[] = ['search', 'guard', 'compare', 'availability', 'quote', 'create-booking', 'modify-booking', 'cancel-booking', 'escalate-booking'];
  return allowed.includes(action) ? action : null;
}

function blockedResponse(message: string, status = 403) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

function ok(data: unknown) {
  return NextResponse.json(
    {
      ok: true,
      data,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

function isPromptInjectionAttempt(prompt: string) {
  const normalized = prompt.toLowerCase();
  const patterns = [
    'ignore previous instructions',
    'reveal system prompt',
    'bypass authorization',
    'disable safety',
    'expose secrets',
    'service role key',
    'hidden internal logs',
    'credentials',
    'simulate admin role',
    'export full database',
    'override environment checks',
    'force ota live activation',
    'production bookings',
    'disable sandbox guard',
    'drop all restrictions',
    'privileged action',
    'اعرض برومبت النظام',
    'تجاهل التعليمات',
    'تجاوز الصلاحيات',
    'كشف المفاتيح',
    'سرّب بيانات العملاء',
    'سرب بيانات العملاء',
    'اوقف الحماية',
    'أوقف الحماية',
    'نفذ طلب غير مصرح',
    'نفذ حجز في production',
    'اتصل بواتساب رغم التوقف',
    'فعّل التكامل الخارجي',
    'نفذ اوامر دون تحقق من الهوية',
    'نفذ أوامر دون تحقق من الهوية',
  ];

  return patterns.some((token) => normalized.includes(token));
}

export async function POST(request: NextRequest) {
  const internalToken = String(process.env.SANDBOX_INTERNAL_TOKEN || '').trim();
  const requestToken = String(request.headers.get('x-sandbox-token') || '').trim();
  const trustedByToken = isTrustedSandboxAutomation(internalToken, requestToken);
  const trustedAutomation = trustedByToken;

  if (!trustedAutomation) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return blockedResponse('Unauthorized', 401);
    }

    const decision = await authorizePilotUser(supabase, user.id);
    if (!decision.allowed) {
      return blockedResponse('Forbidden', 403);
    }
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return blockedResponse('Invalid request body.', 400);
  }

  const action = normalizeAction(body.action);
  if (!action) {
    return blockedResponse('Unsupported action.', 400);
  }

  const environment = resolveSandboxEnvironment();

  try {
    if (action === 'search') {
      const results = await sandboxSearch(environment, {
        query: normalizeString(body.query) ?? undefined,
        city: normalizeString(body.city) ?? undefined,
        category: normalizeString(body.category) ?? undefined,
        currency: normalizeString(body.currency, 3) ?? undefined,
        limit: typeof body.limit === 'number' ? body.limit : undefined,
      });
      return ok({ action, environment, results });
    }

    if (action === 'guard') {
      const prompt = normalizeString(body.prompt, MAX_PROMPT_INPUT) || '';
      const denied = isPromptInjectionAttempt(prompt);
      return ok({
        action,
        environment,
        denied,
        reason: denied ? 'prompt_injection_blocked' : 'clean_prompt',
      });
    }

    if (action === 'compare') {
      const ids = Array.isArray(body.productIds) ? body.productIds.filter((v) => typeof v === 'string') : [];
      const results = await sandboxCompare(environment, ids as string[]);
      return ok({ action, environment, results });
    }

    if (action === 'availability') {
      const productId = normalizeString(body.productId);
      const fromDate = readIsoDate(body.fromDate);
      const toDate = readIsoDate(body.toDate);
      if (!productId) {
        return blockedResponse('Invalid request body.', 400);
      }
      const results = await sandboxAvailability(environment, productId, fromDate, toDate);
      return ok({ action, environment, results });
    }

    if (action === 'quote') {
      const result = await sandboxQuote(environment, {
        productId: normalizeString(body.productId) || '',
        arrivalDate: readIsoDate(body.arrivalDate),
        departureDate: readIsoDate(body.departureDate),
        guests: readGuests(body.guests),
      });
      return ok({ action, environment, result });
    }

    if (action === 'create-booking') {
      const result = await sandboxCreateBooking(environment, {
        productId: normalizeString(body.productId) || '',
        arrivalDate: readIsoDate(body.arrivalDate),
        departureDate: readIsoDate(body.departureDate),
        guests: readGuests(body.guests),
        guestName: normalizeString(body.guestName) || 'Sandbox Guest',
        guestPhone: normalizeString(body.guestPhone, 25) || '+201000000000',
        guestEmail: normalizeString(body.guestEmail, 120) || undefined,
        notes: normalizeString(body.notes, 500) || undefined,
        sourceChannel: 'dabra-ai2-sandbox',
      });
      return ok({ action, environment, result });
    }

    if (action === 'modify-booking') {
      const result = await sandboxModifyBooking(environment, {
        bookingId: normalizeString(body.bookingId) || '',
        arrivalDate: readIsoDate(body.arrivalDate),
        departureDate: readIsoDate(body.departureDate),
        guests: readGuests(body.guests),
        notes: normalizeString(body.notes, 500) || undefined,
      });
      return ok({ action, environment, result });
    }

    if (action === 'cancel-booking') {
      const bookingId = normalizeString(body.bookingId);
      if (!bookingId) {
        return blockedResponse('Invalid request body.', 400);
      }
      const result = await sandboxCancelBooking(environment, bookingId, normalizeString(body.reason, 200) || 'sandbox_cancel');
      return ok({ action, environment, result });
    }

    if (action === 'escalate-booking') {
      const result = await sandboxEscalateBooking(environment, {
        bookingId: normalizeString(body.bookingId) || '',
        reason: normalizeString(body.reason, 200) || 'manual_review_required',
      });
      return ok({ action, environment, result });
    }

  } catch (error) {
    const message = toClientErrorMessage(error);
    const status = message === 'Sandbox API is disabled in production.' || message.includes('not allowed') ? 403 : 400;
    return blockedResponse(message, status);
  }
}
