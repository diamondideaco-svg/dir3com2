import 'server-only';
import { createSupabaseServerClient, getSupabaseAdminHostname } from '@/lib/supabase/server';
import { isCeoActor } from '@/lib/auth/team-access';
import { getDeploymentIdentity } from '@/lib/admin/server-binding-diagnostic';
import { bindingTransport } from '@/lib/admin/drive-worker-binding';
import { bindingSetupReadiness, isBindingApprovalId, type SetupReadiness } from '@/lib/admin/drive-worker-binding-ui';

export type WorkerBindingSetup = { approvalId: string | null; readiness: SetupReadiness };

// The operator supplies a release-specific, short-lived permit through the page URL.
// This is an identifier, never a worker credential. No permit is created or consumed here.
export async function readWorkerBindingSetup(approvalId: unknown): Promise<WorkerBindingSetup> {
  const unavailable: WorkerBindingSetup = { approvalId: null, readiness: 'unavailable' };
  if (!isBindingApprovalId(approvalId) || process.env.VERCEL_ENV !== 'production') return unavailable;
  try {
    const identity = getDeploymentIdentity(process.env);
    const expected = 'ynupwivgvwcyrsdhtkcc.supabase.co';
    const publicUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (!identity || getSupabaseAdminHostname() !== expected
      || publicUrl.origin !== 'https://' + expected || publicUrl.pathname !== '/'
      || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) return unavailable;
    const client = await createSupabaseServerClient(bindingTransport(fetch));
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user || !(await isCeoActor(client, user))) return unavailable;
    const result = await client.rpc('get_task166_worker_binding_state', { p_approval_id: approvalId }).retry(false);
    if (result.error) return unavailable;
    const readiness = bindingSetupReadiness(result.data, approvalId, identity);
    return readiness === 'unavailable' ? unavailable : { approvalId, readiness };
  } catch {
    return unavailable;
  }
}
