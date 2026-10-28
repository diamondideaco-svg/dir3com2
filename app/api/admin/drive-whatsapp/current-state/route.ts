import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { isCeoActor } from '@/lib/auth/team-access';
import { dispatchCurrentStateAsOperator } from '@/lib/admin/drive-current-state-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return dispatchCurrentStateAsOperator(request, {
    authorize: async () => {
      // Only the verified canonical cookie session may establish the actor.
      const supabase = await createSupabaseServerClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && user !== null && await isCeoActor(supabase, user);
    },
    env: process.env,
    getStore: () => supabaseAdmin,
  });
}
