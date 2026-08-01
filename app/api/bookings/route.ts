import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { sanitizeMessage, sanitizeNumber, sanitizeText } from '@/lib/security/validation';
import { logServerError } from '@/lib/security/safe-logger';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
    }

    const body = await request.json();
    const requiredFields = [
      'product_id',
      'product_name',
      'guest_name',
      'guest_phone',
      'arrival_date',
      'departure_date',
      'guests',
      'city',
      'total_price',
    ];

    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ error: `الحقل ${field} مطلوب.` }, { status: 400 });
      }
    }

    const guestName = sanitizeText(body.guest_name, '').slice(0, 80);
    const guestPhone = sanitizeText(body.guest_phone, '').slice(0, 20);
    const city = sanitizeText(body.city, '').slice(0, 80);
    const productName = sanitizeText(body.product_name, '').slice(0, 200);
    const productId = sanitizeText(body.product_id, '').slice(0, 120);
    const productPrice = sanitizeNumber(body.product_price, 0);
    const guestEmail = sanitizeText(body.guest_email, '');
    const notes = sanitizeMessage(body.notes, '');
    const specialRequests = sanitizeMessage(body.special_requests, '');
    const clientPassport = sanitizeText(body.client_passport, '').slice(0, 40);
    const clientNationality = sanitizeText(body.client_nationality, '').slice(0, 80);
    const arrivalDate = sanitizeText(body.arrival_date, '').slice(0, 40);
    const departureDate = sanitizeText(body.departure_date, '').slice(0, 40);
    const totalPrice = sanitizeNumber(body.total_price, 0);
    const guests = sanitizeNumber(body.guests, 1);

    if (!guestName || !guestPhone || !city || !productName || !arrivalDate || !departureDate || totalPrice <= 0 || guests <= 0) {
      return NextResponse.json({ error: 'بيانات الحجز غير صالحة.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
    }

    const bookingReference = `DIR3-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const bookingPayload = {
      user_id: user.id,
      product_id: productId || null,
      product_name: productName,
      product_price: Math.max(0, productPrice),
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail || null,
      arrival_date: arrivalDate,
      departure_date: departureDate,
      guests: Math.max(1, Math.min(20, Math.round(guests))),
      city,
      total_price: Math.max(0, totalPrice),
      notes,
      special_requests: specialRequests || null,
      client_passport: clientPassport || null,
      client_nationality: clientNationality || null,
      booking_reference: bookingReference,
      status: 'pending',
      payment_status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('bookings')
      .insert(bookingPayload)
      .select()
      .single();

    if (error) {
      logServerError('api.bookings.insert_failed', error);
      return NextResponse.json({ error: 'تعذر إتمام الحجز حالياً' }, { status: 500 });
    }

    return NextResponse.json({ data, message: 'تم إنشاء الحجز بنجاح' }, { status: 200 });
  } catch (error) {
    logServerError('api.bookings.unexpected_error', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء معالجة الحجز' }, { status: 500 });
  }
}
