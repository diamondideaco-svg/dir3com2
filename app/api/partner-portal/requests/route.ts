import { NextResponse } from 'next/server';
import { ensurePartnerRecord, requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';

function privateHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

function bookingWhatsappNumber() {
  const raw = process.env.DIR3COM_BOOKING_WHATSAPP_E164 || '';
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export async function GET() {
  const actor = await requirePortalActor();
  if (!actor || actor.authRole !== 'partner') {
    return NextResponse.json({ error: { code: 'PARTNER_REQUEST_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }

  try {
    await ensurePartnerRecord(actor);
    const { data: availabilityRows, error: ownershipError } = await supabaseAdmin
      .from('product_availability')
      .select('product_id')
      .eq('partner_id', actor.userId);
    if (ownershipError) throw ownershipError;

    const productIds = [...new Set((availabilityRows || []).map((row) => row.product_id).filter(Boolean))];
    if (productIds.length === 0) {
      return NextResponse.json({ data: [], whatsappConfigured: Boolean(bookingWhatsappNumber()) }, { headers: privateHeaders() });
    }

    const { data: requests, error: requestError } = await supabaseAdmin
      .from('marketplace_requests')
      .select('id, request_reference, product_id, request_type, status, requested_for, traveller_count, marketplace_family, supplier_name, service_name, fulfilment_method, transaction_method, handoff_type, handoff_reference, handoff_started_at, next_action, created_at, updated_at, products(name_ar,name_en,slug,city,country)')
      .in('product_id', productIds)
      .order('created_at', { ascending: false });
    if (requestError) throw requestError;

    const requestIds = (requests || []).map((request) => request.id);
    let statusAudits: Array<Record<string, unknown>> = [];
    let handoffEvents: Array<Record<string, unknown>> = [];
    if (requestIds.length) {
      const [{ data: auditRows, error: auditError }, { data: handoffRows, error: handoffError }] = await Promise.all([
        supabaseAdmin
          .from('marketplace_request_audit_logs')
          .select('request_id, previous_status, new_status, created_at')
          .in('request_id', requestIds)
          .order('created_at', { ascending: true }),
        supabaseAdmin
          .from('marketplace_request_handoff_events')
          .select('request_id, handoff_type, handoff_reference, request_status_at_handoff, created_at')
          .in('request_id', requestIds)
          .order('created_at', { ascending: true }),
      ]);
      if (auditError) throw auditError;
      if (handoffError) throw handoffError;
      statusAudits = (auditRows || []) as Array<Record<string, unknown>>;
      handoffEvents = (handoffRows || []) as Array<Record<string, unknown>>;
    }

    const data = (requests || []).map((request) => ({
      ...request,
      timeline: [
        { type: 'request_submitted', at: request.created_at, status: request.status },
        ...statusAudits.filter((audit) => audit.request_id === request.id).map((audit) => ({
          type: 'status_updated',
          at: audit.created_at,
          previousStatus: audit.previous_status,
          status: audit.new_status,
        })),
        ...handoffEvents.filter((event) => event.request_id === request.id).map((event) => ({
          type: `${String(event.handoff_type || 'handoff')}_handoff_started`,
          at: event.created_at,
          status: event.request_status_at_handoff,
        })),
      ].sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))),
    }));

    return NextResponse.json({ data, whatsappConfigured: Boolean(bookingWhatsappNumber()) }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.requests.get_failed', error, { actorId: actor.userId });
    return NextResponse.json({ error: { code: 'PARTNER_REQUESTS_READ_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}

export async function POST(request: Request) {
  const actor = await requirePortalActor();
  if (!actor || actor.authRole !== 'partner') {
    return NextResponse.json({ error: { code: 'PARTNER_REQUEST_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }

  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { body = {}; }
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (!requestId) {
    return NextResponse.json({ error: { code: 'REQUEST_ID_REQUIRED' } }, { status: 400, headers: privateHeaders() });
  }

  const whatsapp = bookingWhatsappNumber();
  if (!whatsapp) {
    return NextResponse.json({ error: { code: 'WHATSAPP_HANDOFF_NOT_CONFIGURED' } }, { status: 409, headers: privateHeaders() });
  }

  try {
    await ensurePartnerRecord(actor);
    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from('marketplace_requests')
      .select('id, request_reference, product_id, service_name, requested_for, traveller_count, status')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow) {
      return NextResponse.json({ error: { code: 'REQUEST_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
    }

    const { data: owned, error: ownedError } = await supabaseAdmin
      .from('product_availability')
      .select('id')
      .eq('product_id', requestRow.product_id)
      .eq('partner_id', actor.userId)
      .limit(1);
    if (ownedError) throw ownedError;
    if (!owned?.length) {
      return NextResponse.json({ error: { code: 'REQUEST_PARTNER_SCOPE_DENIED' } }, { status: 404, headers: privateHeaders() });
    }

    const handoffReference = `WA:${requestRow.request_reference}`;
    const { error: handoffError } = await supabaseAdmin.rpc('start_partner_marketplace_request_handoff', {
      p_actor_user_id: actor.userId,
      p_request_id: requestId,
      p_handoff_reference: handoffReference,
    });
    if (handoffError) throw handoffError;

    const text = [
      `DIR3COM ${requestRow.request_reference}`,
      requestRow.service_name ? `Service: ${requestRow.service_name}` : '',
      requestRow.requested_for ? `Requested for: ${requestRow.requested_for}` : '',
      `Travellers: ${requestRow.traveller_count || 1}`,
      `Current status: ${requestRow.status}`,
    ].filter(Boolean).join('\n');

    const url = `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
    logServerEvent('api.partner_portal.requests.whatsapp_handoff_started', { actorId: actor.userId, requestId, requestReference: requestRow.request_reference });
    return NextResponse.json({ data: { requestId, requestReference: requestRow.request_reference, handoffReference, url } }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.requests.handoff_failed', error, { actorId: actor.userId, requestId });
    return NextResponse.json({ error: { code: 'PARTNER_REQUEST_HANDOFF_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
