import 'server-only';
import { cache, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/auth/identity';
import { Chrome, type Viewer } from './Chrome';

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const db = await createSupabaseServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await db.from('profiles').select('full_name, avatar_url, role, created_at').eq('id', user.id).maybeSingle();
  return { id: user.id, name: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'dir3com',
    avatar: profile?.avatar_url || user.user_metadata?.avatar_url || null,
    role: normalizeRole(profile?.role), roleRaw: profile?.role || null, joined: profile?.created_at || null };
});

export default async function AccountFrame({ children, path, navy = false }: { children: ReactNode; path: string; navy?: boolean }) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?redirect=${encodeURIComponent(path)}&next=${encodeURIComponent(path)}`);
  return <Chrome viewer={viewer} variant={navy ? 'navy' : 'light'}>{children}</Chrome>;
}
