import 'server-only';

import { notFound, redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getUserRole(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('users').select('role').eq('id', userId).single();

  if (error || !data?.role) {
    return null;
  }

  return String(data.role).toLowerCase();
}

export async function requireAdminPageAccess(destination = '/admin') {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget(destination));
  }

  const role = await getUserRole(supabase, user.id);
  if (!role || !ADMIN_ROLES.has(role)) {
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

  const role = await getUserRole(supabase, user.id);
  if (!role || !ADMIN_ROLES.has(role)) {
    throw new Error('Forbidden');
  }

  return { supabase, user, role };
}