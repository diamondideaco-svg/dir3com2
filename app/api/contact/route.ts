import { createHash, createHmac } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { handleContact } from '@/lib/contact/handler';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return handleContact(request, async (input, key) => {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseAdmin || !secret) return { kind: 'unavailable' };
    const { data, error } = await supabaseAdmin.rpc('receive_contact_enquiry', {
      p_key: key,
      p_fingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      p_sender_hash: createHmac('sha256', secret).update(input.email).digest('hex'),
      p_input: input,
    });
    if (error || !data) return { kind: 'unavailable' };
    if (data.kind === 'saved' && typeof data.reference === 'string') {
      return { kind: 'saved', reference: data.reference, replay: data.replay === true };
    }
    if (data.kind === 'limited' || data.kind === 'conflict') return { kind: data.kind };
    return { kind: 'unavailable' };
  });
}
