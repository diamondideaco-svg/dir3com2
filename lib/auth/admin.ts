import 'server-only';

import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { isAdminRole, resolveCanonicalUserRole } from '@/lib/auth/identity';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

export async function requireAdminPageAccess(destination = '/admin') {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget(destination));
  }

  const role = await resolveCanonicalUserRole(supabase, user.id);
  if (!role || !isAdminRole(role)) {
    notFound();
  }

  return { user, role };
}

export async function requireAdminActionAccess() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const role = await resolveCanonicalUserRole(supabase, user.id);
  if (!role || !isAdminRole(role)) {
    throw new Error('Forbidden');
  }

  return { supabase, user, role };
}

export async function requireAdminPageDataAccess(destination = '/admin') {
  const { user, role } = await requireAdminPageAccess(destination);
  if (!supabaseAdmin) {
    throw new Error('ADMIN_DATA_ACCESS_UNAVAILABLE');
  }

  return { supabase: supabaseAdmin, user, role };
}

export async function requireAdminReadAccess() {
  const { user, role } = await requireAdminActionAccess();
  if (!supabaseAdmin) {
    throw new Error('ADMIN_DATA_ACCESS_UNAVAILABLE');
  }

  return { supabase: supabaseAdmin, user, role };
}
