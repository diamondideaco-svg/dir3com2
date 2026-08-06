import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveCanonicalUserRole } from '@/lib/auth/identity';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

export default async function DashboardEntryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget('/dashboard'));
  }

  const role = await resolveCanonicalUserRole(supabase, user.id);
  if (role !== 'admin') {
    notFound();
  }

  redirect('/admin');
}
