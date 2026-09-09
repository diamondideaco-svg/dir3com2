import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
  };
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
      .from('partner_settlements')
      .select('id, booking_id, partner_id, amount, currency, settlement_status, release_date, notes, created_at')
      .eq('partner_id', actor.userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      // Finance has not provisioned this relation in the canonical baseline.
      // Preserve that dependency explicitly; never fabricate an empty ledger.
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({ error: { code: 'PORTAL_SETTLEMENTS_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
      }
      throw error;
    }

    return NextResponse.json({ data: data || [] }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.settlements.read_failed', error, {
      route: '/api/partner-portal/settlements',
      actorId: actor.userId,
    });
    return NextResponse.json({ error: { code: 'PORTAL_SETTLEMENTS_READ_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
