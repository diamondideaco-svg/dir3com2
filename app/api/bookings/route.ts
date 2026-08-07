import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRequestClient, supabaseAdmin } from '@/lib/supabase/server';
import { sanitizeMessage, sanitizeNumber, sanitizeText } from '@/lib/security/validation';
import { logServerError } from '@/lib/security/safe-logger';

type BookingCreateErrorCode = 'AUTH_REQUIRED' | 'INVALID_REQUEST' | 'BOOKING_CREATE_FAILED';

const REQUIRED_FIELDS = [
  'product_id',
  'guest_name',
  'guest_phone',
  'arrival_date',
  'departure_date',
  'guests',
  'city',
] as const;

const CLIENT_ALLOWED_KEYS = [
  'product_id',
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
  'product_name',
  'product_price',
  'total_price',
  'total_amount',
  'currency',
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

const ALLOWED_KEY_SET = new Set<string>(CLIENT_ALLOWED_KEYS);

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BookingQuote = {
  productId: string;
  productName: string;
  unitPrice: number;
  currency: string;
  bookingDays: number;
  guests: number;
  totalAmount: number;
};

function parseIsoDate(value: string) {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }

  return parsed;
}

function calculateBookingDays(arrival: Date, departure: Date) {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((departure.getTime() - arrival.getTime()) / millisecondsPerDay);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toMoneyNumber(value: unknown) {
  const parsed = sanitizeNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return roundMoney(parsed);
}

function isProductBookable(product: Record<string, unknown>) {
  const status = sanitizeText(product.status, '').toLowerCase();
  if (status && status !== 'active') {
    return false;
  }

  if (typeof product.is_active === 'boolean' && !product.is_active) {
    return false;
  }

  if (product.deleted_at) {
    return false;
  }

  return true;
}

function getProductDisplayName(product: Record<string, unknown>) {
  return sanitizeText(product.name_ar, '') || sanitizeText(product.name_en, '') || sanitizeText(product.slug, '') || 'Product';
}

function getProductCurrency(product: Record<string, unknown>, fallback = 'SAR') {
  const currency = sanitizeText(product.currency, fallback).toUpperCase().slice(0, 8);
  return currency || fallback;
}

async function resolveServerUnitPrice(productId: string, product: Record<string, unknown>, arrivalDate: string, departureDate: string) {
  const fallbackPriceCandidates = [product.price_per_unit, product.base_price, product.price];

  if (supabaseAdmin) {
    const { data: selectedPrice, error } = await supabaseAdmin
      .from('product_prices')
      .select('id, price, currency, valid_from, valid_to, created_at')
      .eq('product_id', productId)
      .or(`valid_from.is.null,valid_from.lte.${arrivalDate}`)
      .or(`valid_to.is.null,valid_to.gte.${departureDate}`)
      .order('valid_from', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logServerError('api.bookings.product_price_lookup_failed', error);
    }

    const selectedPriceValue = toMoneyNumber(selectedPrice?.price);
    if (Number.isFinite(selectedPriceValue) && selectedPriceValue > 0) {
      return {
        unitPrice: selectedPriceValue,
        currency: getProductCurrency(selectedPrice as Record<string, unknown>, getProductCurrency(product, 'SAR')),
      };
    }
  }

  for (const candidate of fallbackPriceCandidates) {
    const fallbackPrice = toMoneyNumber(candidate);
    if (Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
      return {
        unitPrice: fallbackPrice,
        currency: getProductCurrency(product, 'SAR'),
      };
    }
  }

  return null;
}

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

async function buildBookingQuote(params: {
  productId: string;
  arrivalDate: string;
  departureDate: string;
  guests: number;
}): Promise<{ quote: BookingQuote | null; errorResponse: NextResponse | null }> {
  const { productId, arrivalDate, departureDate, guests } = params;

  if (!supabaseAdmin) {
    return {
      quote: null,
      errorResponse: createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً'),
    };
  }

  const { data: product, error: productLookupError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();

  if (productLookupError) {
    logServerError('api.bookings.product_lookup_failed', productLookupError);
    return {
      quote: null,
      errorResponse: createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً'),
    };
  }

  if (!product) {
    return {
      quote: null,
      errorResponse: createErrorResponse(404, 'INVALID_REQUEST', 'المنتج غير موجود.', {
        product_id: 'المنتج غير موجود.',
      }),
    };
  }

  if (!isProductBookable(product as Record<string, unknown>)) {
    return {
      quote: null,
      errorResponse: createErrorResponse(400, 'INVALID_REQUEST', 'المنتج غير متاح للحجز حالياً.', {
        product_id: 'المنتج غير نشط أو غير قابل للحجز.',
      }),
    };
  }

  const maxGuests = Math.round(sanitizeNumber((product as Record<string, unknown>).max_guests, 0));
  if (maxGuests > 0 && guests > maxGuests) {
    return {
      quote: null,
      errorResponse: createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        guests: `الحد الأقصى للضيوف هو ${maxGuests}.`,
      }),
    };
  }

  const pricing = await resolveServerUnitPrice(productId, product as Record<string, unknown>, arrivalDate, departureDate);
  if (!pricing || pricing.unitPrice <= 0) {
    return {
      quote: null,
      errorResponse: createErrorResponse(400, 'INVALID_REQUEST', 'المنتج غير متاح للحجز حالياً.', {
        product_id: 'تعذر تحديد سعر المنتج من الخادم.',
      }),
    };
  }

  const parsedArrivalDate = parseIsoDate(arrivalDate);
  const parsedDepartureDate = parseIsoDate(departureDate);
  if (!parsedArrivalDate || !parsedDepartureDate) {
    return {
      quote: null,
      errorResponse: createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        arrival_date: 'صيغة تاريخ الوصول غير صالحة.',
        departure_date: 'صيغة تاريخ المغادرة غير صالحة.',
      }),
    };
  }

  const bookingDays = calculateBookingDays(parsedArrivalDate, parsedDepartureDate);
  if (bookingDays < 1) {
    return {
      quote: null,
      errorResponse: createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        departure_date: 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول.',
      }),
    };
  }

  const totalAmount = roundMoney(pricing.unitPrice * bookingDays * guests);

  return {
    quote: {
      productId,
      productName: getProductDisplayName(product as Record<string, unknown>),
      unitPrice: roundMoney(Math.max(0, pricing.unitPrice)),
      currency: pricing.currency,
      bookingDays,
      guests,
      totalAmount: roundMoney(Math.max(0, totalAmount)),
    },
    errorResponse: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await createSupabaseRequestClient(request);

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (request.nextUrl.searchParams.get('action') === 'quote') {
      const productId = sanitizeText(request.nextUrl.searchParams.get('product_id'), '').slice(0, 120);
      const arrivalDate = sanitizeText(request.nextUrl.searchParams.get('arrival_date'), '').slice(0, 40);
      const departureDate = sanitizeText(request.nextUrl.searchParams.get('departure_date'), '').slice(0, 40);
      const rawGuests = sanitizeNumber(request.nextUrl.searchParams.get('guests'), Number.NaN);

      if (!productId || !arrivalDate || !departureDate || !Number.isFinite(rawGuests)) {
        return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
          body: 'Missing quote parameters.',
        });
      }

      if (!UUID_PATTERN.test(productId)) {
        return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
          product_id: 'معرف المنتج غير صالح.',
        });
      }

      if (!Number.isInteger(rawGuests) || rawGuests < 1 || rawGuests > 20) {
        return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
          guests: 'عدد الضيوف غير صالح.',
        });
      }

      const { quote, errorResponse } = await buildBookingQuote({
        productId,
        arrivalDate,
        departureDate,
        guests: rawGuests,
      });

      if (errorResponse) {
        return errorResponse;
      }

      return NextResponse.json({ ok: true, data: quote }, { status: 200 });
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
    const arrivalDate = sanitizeText(body.arrival_date, '').slice(0, 40);
    const departureDate = sanitizeText(body.departure_date, '').slice(0, 40);
    const guests = sanitizeNumber(body.guests, 1);

    if (!guestName || !guestPhone || !city || !productId || !arrivalDate || !departureDate) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.');
    }

    if (!UUID_PATTERN.test(productId)) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        product_id: 'معرف المنتج غير صالح.',
      });
    }

    if (!Number.isFinite(guests) || !Number.isInteger(guests) || guests < 1 || guests > 20) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        guests: 'عدد الضيوف غير صالح.',
      });
    }

    const normalizedGuests = guests;

    const parsedArrivalDate = parseIsoDate(arrivalDate);
    const parsedDepartureDate = parseIsoDate(departureDate);
    if (!parsedArrivalDate || !parsedDepartureDate) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        arrival_date: 'صيغة تاريخ الوصول غير صالحة.',
        departure_date: 'صيغة تاريخ المغادرة غير صالحة.',
      });
    }

    const bookingDays = calculateBookingDays(parsedArrivalDate, parsedDepartureDate);
    if (bookingDays < 1) {
      return createErrorResponse(400, 'INVALID_REQUEST', 'بيانات الحجز غير صالحة.', {
        departure_date: 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول.',
      });
    }

    const { quote, errorResponse } = await buildBookingQuote({
      productId,
      arrivalDate,
      departureDate,
      guests: normalizedGuests,
    });

    if (errorResponse || !quote) {
      return errorResponse ?? createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً');
    }

    const bookingReference = `DIR3-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

    if (!supabaseAdmin) {
      return createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً');
    }

    const bookingPayload = {
      user_id: authContext.user.id,
      product_id: productId,
      product_name: quote.productName,
      product_price: quote.unitPrice,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail || null,
      arrival_date: arrivalDate,
      departure_date: departureDate,
      guests: normalizedGuests,
      city,
      currency: quote.currency,
      total_amount: quote.totalAmount,
      total_price: quote.totalAmount,
      notes,
      special_requests: specialRequests || null,
      client_passport: clientPassport || null,
      client_nationality: clientNationality || null,
      booking_reference: bookingReference,
      status: 'pending',
      payment_status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('bookings')
      .insert(bookingPayload);

    if (error) {
      logServerError('api.bookings.insert_failed', error);
      return createErrorResponse(500, 'BOOKING_CREATE_FAILED', 'تعذر إتمام الحجز حالياً');
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          booking_reference: bookingReference,
          quote,
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
