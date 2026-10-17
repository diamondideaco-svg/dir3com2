'use server';
import { cookies, headers } from 'next/headers';
import { createSupabaseServerClient, getSupabaseAdminHostname, supabaseAdmin } from '@/lib/supabase/server';
import { isCeoActor } from '@/lib/auth/team-access';
import { runTask199Trial, TRIAL, TRIAL_COOKIE, type TrialResult } from '@/lib/admin/task199-trial';

export async function operateTask199(_previous: TrialResult, form: FormData): Promise<TrialResult> {
  if (form.getAll('operation').length !== 1 || [...form.keys()].some(key => key !== 'operation' && !key.startsWith('$ACTION_'))) {
    return { code: 'INVALID_FORM', stopped: false };
  }
  const jar = await cookies();
  const requestHeaders = await headers();
  const supabase = await createSupabaseServerClient();
  return runTask199Trial(form.get('operation'), requestHeaders.get('origin'), {
    authorize: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && user !== null && await isCeoActor(supabase, user);
    },
    env: process.env, hostname: getSupabaseAdminHostname(), store: supabaseAdmin,
    readTicket: () => jar.get(TRIAL_COOKIE)?.value,
    writeTicket: (value, expires) => jar.set(TRIAL_COOKIE, value, {
      httpOnly: true, secure: true, sameSite: 'strict', path: '/admin/task199-trial', expires,
    }),
    clearTicket: () => jar.set(TRIAL_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/admin/task199-trial', maxAge: 0 }),
    readDelivery: async () => {
      const { data, error } = await supabase.rpc('get_drive_whatsapp_delivery', { p_request_id: TRIAL.requestId });
      if (error) throw new Error('DELIVERY_READ_UNCONFIRMED');
      return data;
    },
    now: Date.now,
  });
}
