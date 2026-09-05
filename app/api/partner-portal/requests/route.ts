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

type ScopedPartnerRequest = {
  id: string;
  request_reference: string;
  product_id: string;
  service_name?: string | null;
  requested_for?: string | null;
  traveller_count?: number | null;
  status?: string | null;
};

async function readScopedPartnerRequests(actorUserId: string, requestId: string | null = null) {
  if (!supabaseAdmin) return { data: null, error: { message: 'PORTAL_UNAVAILABLE' } };
  const { data, error } = await supabaseAdmin.rpc('get_partner_marketplace_requests', {
    // This value is derived exclusively from auth.getUser() by requirePortalActor.
    p_actor_user_id: actorUserId,
    p_request_id: requestId,
  });
  return { data: Array.isArray(data) ? data as ScopedPartnerRequest[] : [], error };
}

function firstRpcRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return data && typeof data === 'object' ? data as T : null;
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
    const { data: requests, error: requestError } = await readScopedPartnerRequests(actor.userId);
    if (requestError) throw requestError;
    return NextResponse.json({ data: requests || [], whatsappConfigured: Boolean(bookingWhatsappNumber()) }, { headers: privateHeaders() });
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

  try {
    await ensurePartnerRecord(actor);
    const { data: handoffData, error: handoffError } = await supabaseAdmin.rpc('start_partner_marketplace_request_handoff', {
      p_actor_user_id: actor.userId,
      p_request_id: requestId,
      // The RPC locks the request and persists the delivery destination and
      // message snapshot before returning them. Replays therefore cannot be
      // changed by later request edits or environment configuration changes.
      p_whatsapp_destination: whatsapp || '',
    });
    if (handoffError) {
      if (handoffError.message?.includes('REQUEST_HANDOFF_CONFLICT') || handoffError.message?.includes('REQUEST_HANDOFF_REPLAY_UNAVAILABLE')) {
        return NextResponse.json({ error: { code: handoffError.message.includes('REPLAY_UNAVAILABLE') ? 'REQUEST_HANDOFF_REPLAY_UNAVAILABLE' : 'REQUEST_HANDOFF_CONFLICT' } }, { status: 409, headers: privateHeaders() });
      }
      if (handoffError.message?.includes('WHATSAPP_DESTINATION_INVALID')) {
        return NextResponse.json({ error: { code: 'WHATSAPP_HANDOFF_NOT_CONFIGURED' } }, { status: 409, headers: privateHeaders() });
      }
      if (handoffError.message?.includes('REQUEST_NOT_FOUND') || handoffError.message?.includes('REQUEST_PARTNER_SCOPE_DENIED')) {
        return NextResponse.json({ error: { code: 'REQUEST_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
      }
      throw handoffError;
    }
    const committed = firstRpcRow<{
      request_id: string;
      request_reference: string;
      handoff_reference: string;
      whatsapp_destination: string;
      message_snapshot: string;
    }>(handoffData);
    if (!committed?.request_id || !committed.request_reference || !committed.handoff_reference
      || !/^[0-9]{8,15}$/.test(committed.whatsapp_destination || '') || !committed.message_snapshot) {
      throw new Error('PARTNER_HANDOFF_RESULT_INVALID');
    }

    const url = `https://wa.me/${committed.whatsapp_destination}?text=${encodeURIComponent(committed.message_snapshot)}`;
    logServerEvent('api.partner_portal.requests.whatsapp_handoff_ready', { actorId: actor.userId, requestId, requestReference: committed.request_reference });
    return NextResponse.json({ data: { requestId: committed.request_id, requestReference: committed.request_reference, handoffReference: committed.handoff_reference, url } }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.requests.handoff_failed', error, { actorId: actor.userId, requestId });
    return NextResponse.json({ error: { code: 'PARTNER_REQUEST_HANDOFF_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
