import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getTwilioStatusCallbackUrl, validateTwilioStatusSignature } from '@/lib/integrations/twilio-whatsapp';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';

function toParams(form: FormData) {
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === 'string') params[key] = value;
  return params;
}

export async function POST(request: Request) {
  const expectedUrl = getTwilioStatusCallbackUrl();
  if (!expectedUrl || !supabaseAdmin) return NextResponse.json({ error: 'CALLBACK_UNAVAILABLE' }, { status: 503 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'INVALID_FORM' }, { status: 400 });
  const params = toParams(form);
  const signature = request.headers.get('x-twilio-signature');
  if (!validateTwilioStatusSignature({ signature, url: expectedUrl, params })) {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 403 });
  }

  const messageSid = params.MessageSid ?? '';
  const status = params.EventType?.toUpperCase() === 'READ' ? 'read' : params.MessageStatus ?? params.SmsStatus ?? '';
  const errorCode = params.ErrorCode ?? null;
  const { data, error } = await supabaseAdmin.rpc('apply_partner_whatsapp_callback', {
    p_message_sid: messageSid,
    p_status: status,
    p_error_code: errorCode,
  });
  if (error) {
    const knownRejection = error.message?.includes('MESSAGE_UNKNOWN') || error.message?.includes('REPLAY')
      || error.message?.includes('TRANSITION_INVALID') || error.message?.includes('STATUS_INVALID');
    if (knownRejection) return NextResponse.json({ error: 'CALLBACK_REJECTED' }, { status: 409 });
    logServerError('api.twilio.whatsapp.status.failed', error);
    return NextResponse.json({ error: 'CALLBACK_FAILED' }, { status: 500 });
  }
  logServerEvent('api.twilio.whatsapp.status.applied', { notificationId: data });
  return new NextResponse(null, { status: 204 });
}
