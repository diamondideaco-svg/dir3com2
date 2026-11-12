import type { NextRequest } from 'next/server';
import { createSupabaseRequestClient } from '../supabase/server';
import { resolveCanonicalActiveProfile } from '../auth/identity';
import { readContinuity, type ContinuityRpc } from './continuity-service';
import { continuityChatTripFresh, type ContinuityChatTrip } from './continuity-chat';
import { parseSavedTrip } from './continuity-contract';

export type SuccessfulTaskContinuityBinding = Readonly<{
  schema: 'dabra-task-continuity-v1'; ownerId: string; revision: number; generation: number;
  tripId: string; tripExpiresAtMs: number; originalTrip: NonNullable<ReturnType<typeof parseSavedTrip>>;
}>;
async function resolveContinuitySource(request: NextRequest, input: ContinuityChatTrip) {
  if (process.env.DABRA_CONTINUITY_ENABLED !== 'true') return null;
  const session = await createSupabaseRequestClient(request);
  if (!session) return null;
  const profile = await resolveCanonicalActiveProfile(session.supabase, session.user.id);
  if (!profile || profile.role !== 'customer') return null;
  const state = await readContinuity((name, args) => session.supabase.rpc(name, args) as unknown as ReturnType<ContinuityRpc>);
  // Client trip fields identify the revision only. Planning starts from the
  // authenticated saved state; current-turn refinements remain separate in Core.
  const trip = continuityChatTripFresh(input, state) ? parseSavedTrip(state.trip) : null;
  return trip ? { ownerId: session.user.id, state, trip } : null;
}

/** Existing legacy result remains unchanged; no task receipt or consent expansion. */
export async function resolveContinuityChatTrip(request: NextRequest, input: ContinuityChatTrip) {
  return (await resolveContinuitySource(request, input))?.trip ?? null;
}
/** Receipt comes from the same authenticated read, before current-turn refinement. */
export async function resolveContinuityChatTripReceipt(request: NextRequest, input: ContinuityChatTrip) {
  const source = await resolveContinuitySource(request, input);
  if (!source || source.state.consentVersion !== 'task187-v1') return null;
  const { state, trip, ownerId } = source;
  const binding: SuccessfulTaskContinuityBinding = {
    schema: 'dabra-task-continuity-v1', ownerId, revision: state.revision, generation: state.generation,
    tripId: trip.id, tripExpiresAtMs: Date.parse(state.tripExpiresAt!), originalTrip: { ...trip, families: [...trip.families] },
  };
  return { trip, binding };
}
