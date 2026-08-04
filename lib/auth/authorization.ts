import 'server-only';

import type { NextRequest } from 'next/server';
import { createSupabaseRequestClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdminRole, resolveCanonicalUserRole } from '@/lib/auth/identity';

export class AuthorizationError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? 'Unauthorized' : 'Forbidden');
    this.name = 'AuthorizationError';
  }
}

export async function requireUser(request?: NextRequest) {
  if (request) {
    const context = await createSupabaseRequestClient(request);
    if (!context) throw new AuthorizationError(401);
    return context;
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AuthorizationError(401);
  return { supabase, user };
}

export async function requireAdmin(request?: NextRequest) {
  const context = await requireUser(request);
  const role = await resolveCanonicalUserRole(context.supabase, context.user.id);
  if (!role || !isAdminRole(role)) throw new AuthorizationError(403);
  return { ...context, role };
}
