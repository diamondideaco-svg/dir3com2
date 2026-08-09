import { NextRequest, NextResponse } from 'next/server';
import { authorizePilotUser } from '@/lib/auth/pilot';
import {
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

export const dynamic = 'force-dynamic';

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
  const appEnv = String(process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (appEnv === 'production') {
    return blockedResponse('Sandbox API is disabled in production.', 403);
  }

  const internalToken = String(process.env.SANDBOX_INTERNAL_TOKEN || '').trim();
  const requestToken = String(request.headers.get('x-sandbox-token') || '').trim();
  const trustedByToken = Boolean(internalToken) && internalToken === requestToken;
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

  const action = String(body.action || '').trim().toLowerCase();
  const environment = resolveSandboxEnvironment();

  try {
    if (action === 'search') {
      const results = await sandboxSearch(environment, {
        query: typeof body.query === 'string' ? body.query : undefined,
        city: typeof body.city === 'string' ? body.city : undefined,
        category: typeof body.category === 'string' ? body.category : undefined,
        currency: typeof body.currency === 'string' ? body.currency : undefined,
        limit: typeof body.limit === 'number' ? body.limit : undefined,
      });
      return ok({ action, environment, results });
    }

    if (action === 'guard') {
      const prompt = String(body.prompt || '');
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
      const productId = String(body.productId || '');
      const fromDate = String(body.fromDate || '');
      const toDate = String(body.toDate || '');
      const results = await sandboxAvailability(environment, productId, fromDate, toDate);
      return ok({ action, environment, results });
    }

    if (action === 'quote') {
      const result = await sandboxQuote(environment, {
        productId: String(body.productId || ''),
        arrivalDate: String(body.arrivalDate || ''),
        departureDate: String(body.departureDate || ''),
        guests: Number(body.guests || 1),
      });
      return ok({ action, environment, result });
    }

    if (action === 'create-booking') {
      const result = await sandboxCreateBooking(environment, {
        productId: String(body.productId || ''),
        arrivalDate: String(body.arrivalDate || ''),
        departureDate: String(body.departureDate || ''),
        guests: Number(body.guests || 1),
        guestName: String(body.guestName || 'Sandbox Guest'),
        guestPhone: String(body.guestPhone || '+201000000000'),
        guestEmail: typeof body.guestEmail === 'string' ? body.guestEmail : undefined,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        sourceChannel: 'dabra-ai2-sandbox',
      });
      return ok({ action, environment, result });
    }

    if (action === 'modify-booking') {
      const result = await sandboxModifyBooking(environment, {
        bookingId: String(body.bookingId || ''),
        arrivalDate: String(body.arrivalDate || ''),
        departureDate: String(body.departureDate || ''),
        guests: Number(body.guests || 1),
        notes: typeof body.notes === 'string' ? body.notes : undefined,
      });
      return ok({ action, environment, result });
    }

    if (action === 'cancel-booking') {
      const result = await sandboxCancelBooking(environment, String(body.bookingId || ''), String(body.reason || 'sandbox_cancel'));
      return ok({ action, environment, result });
    }

    if (action === 'escalate-booking') {
      const result = await sandboxEscalateBooking(environment, {
        bookingId: String(body.bookingId || ''),
        reason: String(body.reason || 'manual_review_required'),
      });
      return ok({ action, environment, result });
    }

    return blockedResponse('Unsupported action.', 400);
  } catch (error) {
    return blockedResponse(error instanceof Error ? error.message : 'Sandbox operation failed.', 400);
  }
}
