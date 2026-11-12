import 'server-only';
import type { NextRequest } from 'next/server';
import { createSupabaseRequestClient, getSupabaseClientHostname, getSupabaseAdminHostname, supabaseAdmin } from '../supabase/server';
import { resolveCanonicalActiveProfile } from '../auth/identity';
import { isCredentialBindingCoreProject } from './credential-binding';

/** Session-derived Core identity; callers never accept an actor or project in JSON. */
export async function withSuccessfulTaskOwner<T>(request: NextRequest, signal: AbortSignal,
  operation: (actor: string, role: string, admin: NonNullable<typeof supabaseAdmin>) => Promise<T>): Promise<T | null> {
  const session = await createSupabaseRequestClient(request), admin = supabaseAdmin;
  if (!session || !admin || signal.aborted) return null;
  const actor = session.user.id;
  const project = () => isCredentialBindingCoreProject(getSupabaseAdminHostname())
    && getSupabaseAdminHostname() === getSupabaseClientHostname(session.supabase);
  if (!project()) return null;
  const profile = await resolveCanonicalActiveProfile(session.supabase, actor);
  if (!profile || profile.id !== actor || !project() || signal.aborted) return null;
  const value = await operation(actor, profile.role, admin);
  if (signal.aborted || !project()) return null;
  const auth = await session.supabase.auth.getUser();
  const current = await resolveCanonicalActiveProfile(session.supabase, actor);
  if (auth.error || auth.data.user?.id !== actor || !current || current.id !== actor
    || current.role !== profile.role || current.sourceRole !== profile.sourceRole || !project() || signal.aborted) return null;
  return value;
}
