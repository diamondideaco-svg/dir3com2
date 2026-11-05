import { createSupabaseServerClient, getSupabaseAdminHostname } from '@/lib/supabase/server';
import { isCeoActor } from '@/lib/auth/team-access';
import { getDeploymentIdentity } from '@/lib/admin/server-binding-diagnostic';
import { bindExistingWorkerAsCeo } from '@/lib/admin/drive-worker-binding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return bindExistingWorkerAsCeo(request, {
    authorize: async (transport) => {
      const client = await createSupabaseServerClient(transport);
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user || !(await isCeoActor(client, user))) return null;
      let publicHostname: string | null = null;
      try {
        const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
        if (url.origin === 'https://ynupwivgvwcyrsdhtkcc.supabase.co' && url.pathname === '/'
          && !url.search && !url.hash && !url.username && !url.password) publicHostname = url.hostname;
      } catch { /* A fixed identity-unverified result is returned by the helper. */ }
      return {
        adminHostname: getSupabaseAdminHostname(), publicHostname,
        readState: (approvalId) => client.rpc('get_task166_worker_binding_state', { p_approval_id: approvalId }).retry(false),
        bind: ({ approvalId, sourceSha, deploymentId, worker }) => client.rpc('bind_task166_existing_worker', {
          p_approval_id: approvalId, p_source_sha: sourceSha, p_deployment_id: deploymentId, p_worker: worker,
        }).retry(false),
      };
    },
    runtime: () => process.env.VERCEL_ENV === 'production' ? getDeploymentIdentity(process.env) : null,
    readWorker: () => process.env.DIR3COM_WHATSAPP_WORKER_SECRET,
  });
}
