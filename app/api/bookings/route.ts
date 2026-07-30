import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { sanitizeMessage, sanitizeNumber, sanitizeText } from '@/lib/security/validation';

export async function POST(request: NextRequest) {
  try {
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
    const guestEmail = sanitizeText(body.guest_email, '');
    const notes = sanitizeMessage(body.notes, '');
    const totalPrice = sanitizeNumber(body.total_price, 0);
    const guests = sanitizeNumber(body.guests, 1);

    if (!guestName || !guestPhone || !city || totalPrice <= 0 || guests <= 0) {
      return NextResponse.json({ error: 'بيانات الحجز غير صالحة.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
    }

    const bookingReference = `DIR3-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const bookingPayload = {
      ...body,
      product_id: sanitizeText(body.product_id, '') || null,
      product_name: sanitizeText(body.product_name, ''),
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail || null,
      arrival_date: sanitizeText(body.arrival_date, ''),
      departure_date: sanitizeText(body.departure_date, ''),
      guests: Math.max(1, Math.min(20, Math.round(guests))),
      city,
      total_price: Math.max(0, totalPrice),
      notes,
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
      console.error('Supabase booking insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, message: 'تم إنشاء الحجز بنجاح' }, { status: 200 });
  } catch (error) {
    console.error('Booking API error:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء معالجة الحجز' }, { status: 500 });
  }
}
