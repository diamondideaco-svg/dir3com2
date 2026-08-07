import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRequestClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';

const BOOKING_ID_MAX_LENGTH = 64;
const BOOKING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBookingId(value: string | null | undefined) {
  const normalized = decodeURIComponent((value ?? '').trim()).toLowerCase();

  if (!normalized || normalized.length > BOOKING_ID_MAX_LENGTH || !BOOKING_ID_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function buildUnavailableResponse() {
  return NextResponse.json({ error: 'This booking is unavailable.' }, { status: 404 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bookingId = normalizeBookingId(id);

    if (!bookingId) {
      return NextResponse.json({ error: 'Invalid booking identifier.' }, { status: 400 });
    }

    const authContext = await createSupabaseRequestClient(request);

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await authContext.supabase
      .from('bookings')
      .select('id, booking_reference, status, total_amount, total_price, payment_status, currency, product_name, arrival_date, departure_date, city, guests, guest_name, guest_phone, guest_email, notes, created_at')
      .eq('id', bookingId)
      .eq('user_id', authContext.user.id)
      .maybeSingle();

    if (error) {
      logServerError('api.bookings.detail_read_failed', error);
      return NextResponse.json({ error: 'Unable to load booking details right now.' }, { status: 500 });
    }

    if (!data) {
      return buildUnavailableResponse();
    }

    return NextResponse.json(
      {
        booking: {
          id: data.id,
          booking_reference: data.booking_reference,
          status: data.status,
          payment_status: data.payment_status ?? null,
          total_amount: data.total_amount,
          total_price: data.total_price,
          currency: data.currency ?? null,
          service_name: data.product_name ?? 'Product',
          arrival_date: data.arrival_date ?? null,
          departure_date: data.departure_date ?? null,
          city: data.city ?? null,
          guests: data.guests ?? null,
          guest_name: data.guest_name ?? null,
          guest_phone: data.guest_phone ?? null,
          guest_email: data.guest_email ?? null,
          notes: data.notes ?? null,
          created_at: data.created_at ?? null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError('api.bookings.detail_read_unexpected_error', error);
    return NextResponse.json({ error: 'Unable to load booking details right now.' }, { status: 500 });
  }
}