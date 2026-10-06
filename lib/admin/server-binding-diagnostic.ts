import 'server-only';
import { createSupabaseServerClient, getSupabaseAdminHostname } from '@/lib/supabase/server';
import { isCeoActor } from '@/lib/auth/team-access';

type DeploymentIdentity = { deploymentId: string; deploymentUrl: string; sha: string };
type DiagnosticResult =
  | { status: 'anonymous' | 'forbidden' | 'unavailable' }
  | { status: 'verified'; hostname: string; deployment: DeploymentIdentity; observedAt: string };

// System-provided identity only; never request headers, search params, or public envs.
// The handoff must corroborate these fields with Vercel get_deployment.
export function getDeploymentIdentity(env: Record<string, string | undefined>): DeploymentIdentity | null {
  const id = env.VERCEL_DEPLOYMENT_ID ?? '';
  const hostname = env.VERCEL_URL ?? '';
  const sha = env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (env.VERCEL !== '1' || !['production', 'preview'].includes(env.VERCEL_ENV ?? '')
    || !/^dpl_[A-Za-z0-9]{10,100}$/.test(id)
    || !/^[a-z0-9][a-z0-9-]{1,200}\.vercel\.app$/.test(hostname)
    || hostname === env.VERCEL_BRANCH_URL || hostname === env.VERCEL_PROJECT_PRODUCTION_URL
    || !/^[a-f0-9]{40}$/.test(sha)) return null;
  return { deploymentId: id, deploymentUrl: 'https://' + hostname, sha };
}

export async function readServerBindingDiagnostic(): Promise<DiagnosticResult> {
  // Public-auth client and canonical active CEO guard, not the unknown admin DB.
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { status: 'anonymous' };
    if (!(await isCeoActor(supabase, user))) return { status: 'forbidden' };

    const deployment = getDeploymentIdentity(process.env);
    if (!deployment) return { status: 'unavailable' };
    const hostname = getSupabaseAdminHostname();
    if (!hostname) return { status: 'unavailable' };
    return { status: 'verified', hostname, deployment, observedAt: new Date().toISOString() };
  } catch {
    // No raw configuration, credentials, contacts or provider/DB errors.
    return { status: 'unavailable' };
  }
}
