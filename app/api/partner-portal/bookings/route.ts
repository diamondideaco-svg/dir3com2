import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';
import { isCurrentPartnerAssignment } from '@/lib/partner-portal/booking-visibility';

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
    const { data: assignments, error: assignmentError } = await supabaseAdmin
      .from('partner_assignments')
      .select('booking_id')
      .eq('partner_id', actor.userId)
      .order('assigned_at', { ascending: false })
      .limit(100);
    if (assignmentError) throw assignmentError;
    const ids = [...new Set((assignments || []).map((row) => row.booking_id))];
    if (!ids.length) return NextResponse.json({ data: [] }, { headers: privateHeaders() });

    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('id, booking_reference, status, total_amount, total_price, currency, created_at, updated_at, product_name, partner_assignments(partner_id, assignment_status, assigned_at)')
      .in('id', ids)
      .is('deleted_at', null)
      .order('assigned_at', { referencedTable: 'partner_assignments', ascending: false })
      .limit(2, { referencedTable: 'partner_assignments' })
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    // The canonical owner relation is partner_assignments, not a client field
    // or a product label. Do not expose the internal association in the DTO.
    const rows = (data || []).filter((row) => isCurrentPartnerAssignment(row.partner_assignments, actor.userId))
      .map(({ partner_assignments: association, ...booking }) => {
      void association;
      return booking;
    });
    return NextResponse.json({ data: rows }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.bookings.read_failed', error, {
      route: '/api/partner-portal/bookings',
      actorId: actor.userId,
    });
    return NextResponse.json({ error: { code: 'PORTAL_BOOKINGS_READ_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
