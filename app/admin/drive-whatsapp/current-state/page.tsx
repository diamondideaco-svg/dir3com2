import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isCeoActor } from '@/lib/auth/team-access';
import DriveCurrentStateOperator from '@/components/admin/DriveCurrentStateOperator';

export const runtime = 'nodejs';

export default async function DriveCurrentStatePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !(await isCeoActor(supabase, user))) notFound();
  return <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-8 lg:px-8"><DriveCurrentStateOperator /></main>;
}
