import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRequestClient, supabaseAdmin } from '@/lib/supabase/server';
import { sanitizeMessage, sanitizeNumber, sanitizeText } from '@/lib/security/validation';
import { logServerError } from '@/lib/security/safe-logger';

type BookingCreateErrorCode = 'AUTH_REQUIRED' | 'INVALID_REQUEST' | 'PRODUCT_UNAVAILABLE' | 'BOOKING_CREATE_FAILED';

const REQUIRED_FIELDS = [
  'product_id',
  'guest_name',
  'guest_phone',
  'arrival_date',
  'departure_date',
  'guests',
  'city',
] as const;

// Legacy price/name fields remain accepted for compatibility, but are ignored by the server.
const TRANSITIONAL_ALLOWED_KEYS = [
  'product_id',
  'product_name',
  'product_price',
  'total_price',
  'guest_name',
  'guest_phone',
  'guest_email',
  'arrival_date',
  'departure_date',
  'guests',
  'city',
  'notes',
  'special_requests',
  'client_passport',
  'client_nationality',
] as const;

const FORBIDDEN_INPUT_KEYS = [
  'user_id',
  'profile_id',
  'owner_id',
  'provider_id',
  'partner_id',
  'partner_assignment_id',
  'assigned_partner_id',
  'booking_reference',
  'status',
  'payment_status',
  'created_at',
  'updated_at',
] as const;

const ALLOWED_KEY_SET = new Set<string>(TRANSITIONAL_ALLOWED_KEYS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwnKey(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isMissingRequiredValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  return value === null || value === undefined;
}

function parseDateOnly(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function getUtcDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createErrorResponse(status: number, code: BookingCreateErrorCode, message: string, fieldErrors?: Record<string, string>) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(fieldErrors && Object.keys(fieldErrors).length > 0 ? { field_errors: fieldErrors } : {}),
      },
    },
    { status }
  );
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await createSupabaseRequestClient(request);

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await authContext.supabase
      .from('bookings')
      .select('id, booking_reference, status, total_amount, total_price, currency, service_name, product_name, arrival_date, departure_date, created_at')
      .eq('user_id', authContext.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      logServerError('api.bookings.read_failed', error);
      return NextResponse.json({ error: 'Unable to load bookings right now.' }, { status: 500 });
    }

    const bookings = (data ?? []).map((booking) => ({
      id: booking.id,
      booking_reference: booking.booking_reference,
      status: booking.status,
      total_amount: booking.total_amount,
      total_price: booking.total_price,
      currency: booking.currency,
      service_name: booking.service_name ?? booking.product_name ?? null,
      arrival_date: booking.arrival_date,
      departure_date: booking.departure_date,
      created_at: booking.created_at,
    }));

    return NextResponse.json({ bookings }, { status: 200 });
  } catch (error) {
    logServerError('api.bookings.read_unexpected_error', error);
    return NextResponse.json({ error: 'Unable to load bookings right now.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await createSupabaseRequestClient(request);

    if (!authContext) {
      return createErrorResponse(401, 'AUTH_REQUIRED', 'يجب تسجيل الدخول');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', { body: 'Request body must be valid JSON.' });
    }

    if (!isPlainObject(body)) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        body: 'Request body must be a JSON object.',
      });
    }

    const forbiddenFieldErrors: Record<string, string> = {};
    for (const key of FORBIDDEN_INPUT_KEYS) {
      if (hasOwnKey(body, key)) {
        forbiddenFieldErrors[key] = 'This field is server-controlled and cannot be provided by clients.';
      }
    }

    if (Object.keys(forbiddenFieldErrors).length > 0) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', forbiddenFieldErrors);
    }

    const unknownFields = Object.keys(body).filter((key) => !ALLOWED_KEY_SET.has(key));
    if (unknownFields.length > 0) {
      const unknownFieldErrors = unknownFields.reduce<Record<string, string>>((errors, key) => {
        errors[key] = 'Unknown field is not allowed.';
        return errors;
      }, {});

      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', unknownFieldErrors);
    }

    const requiredFieldErrors = REQUIRED_FIELDS.reduce<Record<string, string>>((errors, field) => {
      if (isMissingRequiredValue(body[field])) {
        errors[field] = `الحقل ${field} مطلوب.`;
      }
      return errors;
    }, {});

    if (Object.keys(requiredFieldErrors).length > 0) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', requiredFieldErrors);
    }

    const guestName = sanitizeText(body.guest_name, '').slice(0, 80);
    const guestPhone = sanitizeText(body.guest_phone, '').slice(0, 20);
    const city = sanitizeText(body.city, '').slice(0, 80);
    const productId = sanitizeText(body.product_id, '').slice(0, 120);
    const guestEmail = sanitizeText(body.guest_email, '');
    const notes = sanitizeMessage(body.notes, '');
    const specialRequests = sanitizeMessage(body.special_requests, '');
    const clientPassport = sanitizeText(body.client_passport, '').slice(0, 40);
    const clientNationality = sanitizeText(body.client_nationality, '').slice(0, 80);
    const arrivalDateValue = sanitizeText(body.arrival_date, '').slice(0, 10);
    const departureDateValue = sanitizeText(body.departure_date, '').slice(0, 10);
    const guests = sanitizeNumber(body.guests, 1);

    const arrivalDate = parseDateOnly(arrivalDateValue);
    const departureDate = parseDateOnly(departureDateValue);
    if (!guestName || !guestPhone || !city || !isUuid(productId) || !arrivalDate || !departureDate || guests <= 0) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.');
    }

    if (arrivalDate < getUtcDateOnly() || departureDate <= arrivalDate) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        dates: 'Arrival must be today or later and departure must be after arrival.',
      });
    }

    if (!supabaseAdmin) {
      return createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً');
    }

    const requestKey = request.headers.get('idempotency-key')?.trim() ?? '';
    if (!isUuid(requestKey)) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        idempotency_key: 'A valid Idempotency-Key header is required.',
      });
    }

    const { data: existingBooking, error: existingError } = await supabaseAdmin
      .from('bookings')
      .select('booking_reference')
      .eq('user_id', authContext.user.id)
      .eq('request_key', requestKey)
      .maybeSingle();

    if (existingError) {
      logServerError('api.bookings.idempotency_read_failed', existingError);
      return createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً');
    }
    if (existingBooking) {
      return NextResponse.json({ ok: true, data: existingBooking, message: 'تم إنشاء الحجز بنجاح' });
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, name_ar, base_price, currency, status, is_active')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      logServerError('api.bookings.product_read_failed', productError);
      return createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً');
    }
    if (!product || product.status !== 'active' || product.is_active !== true) {
      return createErrorResponse(404, 'PRODUCT_UNAVAILABLE', 'الخدمة غير متاحة للحجز.');
    }

    const { data: datedPrice, error: priceError } = await supabaseAdmin
      .from('product_prices')
      .select('price, currency')
      .eq('product_id', productId)
      .lte('valid_from', arrivalDateValue)
      .gte('valid_to', departureDateValue)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priceError) {
      logServerError('api.bookings.price_read_failed', priceError);
      return createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً');
    }

    const unitPrice = Number(datedPrice?.price ?? product.base_price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً');
    }
    const guestCount = Math.max(1, Math.min(20, Math.round(guests)));
    const dayCount = Math.ceil((departureDate.getTime() - arrivalDate.getTime()) / 86_400_000);
    const totalPrice = Math.round(unitPrice * dayCount * guestCount * 100) / 100;
    const bookingReference = `DIR3-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;

    const bookingPayload = {
      user_id: authContext.user.id,
      profile_id: authContext.user.id,
      product_id: productId || null,
      product_name: product.name_ar,
      product_price: unitPrice,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail || null,
      arrival_date: arrivalDateValue,
      departure_date: departureDateValue,
      guests: guestCount,
      city,
      total_price: totalPrice,
      total_amount: totalPrice,
      currency: datedPrice?.currency ?? product.currency,
      notes,
      special_requests: specialRequests || null,
      client_passport: clientPassport || null,
      client_nationality: clientNationality || null,
      booking_reference: bookingReference,
      request_key: requestKey,
      status: 'pending',
      payment_status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('bookings')
      .insert(bookingPayload);

    if (error) {
      if (error.code === '23505') {
        const { data: duplicate } = await supabaseAdmin
          .from('bookings')
          .select('booking_reference')
          .eq('user_id', authContext.user.id)
          .eq('request_key', requestKey)
          .maybeSingle();
        if (duplicate) {
          return NextResponse.json({ ok: true, data: duplicate, message: 'تم إنشاء الحجز بنجاح' });
        }
      }
      logServerError('api.bookings.insert_failed', error);
      return createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً');
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          booking_reference: bookingReference,
        },
        message: 'تم إنشاء الحجز بنجاح',
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError('api.bookings.unexpected_error', error);
    return createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'حدث خطأ في الخادم أثناء معالجة الحجز');
  }
}
