import { requireAdminReadAccess } from '@/lib/auth/admin';
import { CEO_EMAIL, TEAM_PERMISSIONS, isCeoActor, isCeoUserId } from '@/lib/auth/team-access';
import { setTeamAccessStatusAction, upsertTeamAccessGrantAction } from '@/lib/actions/team-access-actions';

export default async function TeamAccessPage() {
  const { supabase, user } = await requireAdminReadAccess();
  if (!await isCeoActor(supabase, user)) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
        <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-red-100">
          CEO access required.
        </div>
      </main>
    );
  }

  const { data: grants, error } = await supabase
    .from('team_access_grants')
    .select('id, email, job_title, access_level, country_scope, permissions, status, invited_user_id, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Unable to load team access grants.');

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold text-[#D4AF37]">CEO CONTROL</p>
        <h2 className="mt-2 text-3xl font-semibold">Team & Access Management</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Official CEO account: {CEO_EMAIL}. Invite employees, assign job titles, choose country scope and permissions, or grant full global admin access.
        </p>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-xl font-semibold">Add or update employee</h3>
        <form action={upsertTeamAccessGrantAction} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span>Email</span>
            <input name="email" type="email" required className="rounded-xl border border-white/15 bg-white px-3 py-2 text-slate-900" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>Job title</span>
            <input name="jobTitle" required placeholder="Egypt Manager" className="rounded-xl border border-white/15 bg-white px-3 py-2 text-slate-900" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>Access level</span>
            <select name="accessLevel" defaultValue="scoped_staff" className="rounded-xl border border-white/15 bg-white px-3 py-2 text-slate-900">
              <option value="scoped_staff">Scoped staff</option>
              <option value="global_admin">Global admin</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span>Country scope (comma separated)</span>
            <input name="countryScope" placeholder="EG, QA" className="rounded-xl border border-white/15 bg-white px-3 py-2 text-slate-900" />
          </label>
          <fieldset className="md:col-span-2">
            <legend className="mb-3 text-sm font-semibold">Permissions</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TEAM_PERMISSIONS.filter((permission) => permission !== 'admin:full').map((permission) => (
                <label key={permission} className="flex items-center gap-2 rounded-xl border border-white/10 p-3 text-sm">
                  <input type="checkbox" name="permissions" value={permission} />
                  <span>{permission}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="md:col-span-2">
            <button className="rounded-full bg-[#D4AF37] px-5 py-2.5 font-semibold text-[#0A1726]">Save employee access</button>
          </div>
        </form>
      </section>

      <section className="mt-8 space-y-4">
        {(grants ?? []).map((grant) => (
          <article key={grant.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{grant.job_title}</p>
                <p className="text-sm text-slate-300">{grant.email}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-[#D4AF37]">{grant.access_level} · {grant.status}</p>
              </div>
              <form action={setTeamAccessStatusAction}>
                <input type="hidden" name="email" value={grant.email} />
                <input type="hidden" name="status" value={grant.status === 'active' ? 'inactive' : 'active'} />
                <button disabled={isCeoUserId(grant.invited_user_id)} className="rounded-full border border-white/15 px-4 py-2 text-sm disabled:opacity-40">
                  {grant.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </form>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
              <p>Countries: {(grant.country_scope ?? []).join(', ') || '—'}</p>
              <p>Permissions: {(grant.permissions ?? []).join(', ') || '—'}</p>
            </div>
          </article>
        ))}
        {(grants ?? []).length === 0 ? <p className="text-sm text-slate-400">No employees assigned yet.</p> : null}
      </section>
    </main>
  );
}
