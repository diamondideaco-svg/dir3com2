import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
  };
}

function isReadSchemaDrift(error: unknown) {
  const code = String((error as { code?: unknown })?.code || '').toUpperCase();
  return code.startsWith('PGRST') || code === '42P01' || code === '42703';
}

export async function GET() {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('id, booking_reference, status, total_amount, total_price, currency, created_at, updated_at, customer_name, product_name, partner_id')
      .eq('partner_id', actor.userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      if (isReadSchemaDrift(error)) {
        return NextResponse.json({ data: [] }, { headers: privateHeaders() });
      }
      throw error;
    }

    return NextResponse.json({ data: data || [] }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.bookings.read_failed', error, {
      route: '/api/partner-portal/bookings',
      actorId: actor.userId,
    });
    return NextResponse.json({ error: { code: 'PORTAL_BOOKINGS_READ_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
