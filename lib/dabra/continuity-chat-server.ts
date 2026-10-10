import type { NextRequest } from 'next/server';
import { createSupabaseRequestClient } from '../supabase/server';
import { resolveCanonicalActiveProfile } from '../auth/identity';
import { readContinuity, type ContinuityRpc } from './continuity-service';
import { continuityChatTripFresh, type ContinuityChatTrip } from './continuity-chat';

export async function resolveContinuityChatTrip(request: NextRequest, input: ContinuityChatTrip) {
  if (process.env.DABRA_CONTINUITY_ENABLED !== 'true') return null;
  const session = await createSupabaseRequestClient(request);
  if (!session) return null;
  const profile = await resolveCanonicalActiveProfile(session.supabase, session.user.id);
  if (!profile || profile.role !== 'customer') return null;
  const state = await readContinuity((name, args) => session.supabase.rpc(name, args) as unknown as ReturnType<ContinuityRpc>);
  return continuityChatTripFresh(input, state) ? input.trip : null;
}
