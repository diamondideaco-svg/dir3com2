import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { assertCountryAllowed, requireScopedAdminActionAccess } from '@/lib/auth/admin';
import { getTwilioWhatsappConfig, sendPartnerWhatsappMessage } from '@/lib/integrations/twilio-whatsapp';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function privateHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

function firstRow<T>(value: unknown): T | null {
  return Array.isArray(value) ? (value[0] as T | undefined) ?? null : value && typeof value === 'object' ? value as T : null;
}

export async function POST(request: Request) {
  let actorId: string | null = null;
  let requestId = '';
  try {
    const access = await requireScopedAdminActionAccess('operations:write');
    actorId = access.user.id;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!UUID_PATTERN.test(requestId)) {
      return NextResponse.json({ error: { code: 'REQUEST_ID_INVALID' } }, { status: 400, headers: privateHeaders() });
    }

    const config = getTwilioWhatsappConfig();
    if (!config.enabled) {
      return NextResponse.json({ data: { state: 'disabled' } }, { status: 409, headers: privateHeaders() });
    }
    if (!config.configured) {
      return NextResponse.json({ error: { code: 'TWILIO_WHATSAPP_NOT_CONFIGURED' } }, { status: 503, headers: privateHeaders() });
    }

    const { data: requestRow, error: requestError } = await access.supabase
      .from('marketplace_requests').select('id,request_reference,product_id,status').eq('id', requestId).maybeSingle();
    if (requestError || !requestRow) {
      return NextResponse.json({ error: { code: 'REQUEST_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
    }
    const { data: availability, error: availabilityError } = await access.supabase
      .from('product_availability').select('partner_id').eq('product_id', requestRow.product_id).not('partner_id', 'is', null);
    if (availabilityError) throw availabilityError;
    const partnerIds = [...new Set((availability ?? []).map((row) => row.partner_id).filter(Boolean))];
    if (partnerIds.length !== 1) {
      return NextResponse.json({ error: { code: 'REQUEST_PARTNER_AMBIGUOUS' } }, { status: 409, headers: privateHeaders() });
    }
    const { data: partner, error: partnerError } = await access.supabase
      .from('partners').select('id,country,status,deleted_at,synthetic').eq('id', partnerIds[0]).maybeSingle();
    if (partnerError || !partner || partner.status !== 'active' || partner.deleted_at || partner.synthetic) {
      return NextResponse.json({ error: { code: 'REQUEST_PARTNER_UNAVAILABLE' } }, { status: 409, headers: privateHeaders() });
    }
    assertCountryAllowed(access.scope, partner.country);

    const idempotencyKey = createHash('sha256')
      .update(`${requestRow.id}:${partner.id}:${config.contentSid}:partner_request_notification_v1`)
      .digest('hex');
    const { data: preparedData, error: preparedError } = await access.supabase.rpc('prepare_partner_whatsapp_notification', {
      p_actor_user_id: access.user.id,
      p_request_id: requestRow.id,
      p_content_sid: config.contentSid,
      p_idempotency_key: idempotencyKey,
    });
    if (preparedError) {
      const code = preparedError.message?.includes('RECIPIENT_INVALID') ? 'PARTNER_PHONE_INVALID'
        : preparedError.message?.includes('COUNTRY_SCOPE') || preparedError.message?.includes('ACTOR_DENIED') ? 'FORBIDDEN'
          : 'NOTIFICATION_PREPARE_FAILED';
      return NextResponse.json({ error: { code } }, { status: code === 'FORBIDDEN' ? 403 : 409, headers: privateHeaders() });
    }
    const prepared = firstRow<{
      id: string; status: string; recipient_e164: string; content_variables: Record<string, string>;
      twilio_message_sid?: string | null;
    }>(preparedData);
    if (!prepared?.id) throw new Error('PARTNER_WHATSAPP_PREPARE_RESULT_INVALID');
    if (prepared.status !== 'prepared') {
      return NextResponse.json({ data: { state: prepared.status, idempotent: true } }, { headers: privateHeaders() });
    }

    const { data: claimed, error: claimError } = await access.supabase.rpc('claim_partner_whatsapp_notification', {
      p_notification_id: prepared.id,
    });
    if (claimError) throw claimError;
    if (claimed !== true) {
      return NextResponse.json({ data: { state: 'prepared', idempotent: true } }, { status: 409, headers: privateHeaders() });
    }

    let result: Awaited<ReturnType<typeof sendPartnerWhatsappMessage>>;
    try {
      result = await sendPartnerWhatsappMessage({
        recipientE164: prepared.recipient_e164,
        contentVariables: prepared.content_variables,
      });
    } catch (providerError) {
      await access.supabase.rpc('fail_partner_whatsapp_notification', {
        p_notification_id: prepared.id,
        p_error_code: 'PROVIDER_REQUEST_FAILED',
      });
      throw providerError;
    }
    const { error: queueError } = await access.supabase.rpc('queue_partner_whatsapp_notification', {
      p_notification_id: prepared.id,
      p_message_sid: result.messageSid,
    });
    if (queueError) throw queueError;
    logServerEvent('api.admin.operations.partner_whatsapp.queued', { actorId, requestId, notificationId: prepared.id });
    return NextResponse.json({ data: { state: 'queued' } }, { status: 202, headers: privateHeaders() });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: { code: error.message.toUpperCase() } }, { status: error.message === 'Unauthorized' ? 401 : 403, headers: privateHeaders() });
    }
    logServerError('api.admin.operations.partner_whatsapp.failed', error, { actorId, requestId });
    return NextResponse.json({ error: { code: 'PARTNER_WHATSAPP_SEND_FAILED' } }, { status: 502, headers: privateHeaders() });
  }
}
