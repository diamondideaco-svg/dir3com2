import Link from 'next/link';
import { requireAdminPageDataAccess } from '@/lib/auth/admin';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

type AssignmentRule = {
  id: string;
  service_type: string;
  priority_weight: number;
  enabled: boolean;
};

async function getRules() {
  const { supabase } = await requireAdminPageDataAccess('/admin/assignment/rules');
  const { data, error } = await supabase.from('assignment_rules').select('*').order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { rules: [] as AssignmentRule[], error: 'تعذر تحميل قواعد التعيين حالياً.' };
  }

  return { rules: (data ?? []) as AssignmentRule[], error: null };
}

export default async function AssignmentRulesPage() {
  const { rules, error } = await getRules();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="القواعد" en="Rules" /></p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]"><AdminText ar="قواعد التعيين" en="Assignment rules" /></h1>
          </div>
          <Link href="/admin/assignment" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="العودة" en="Back" /></Link>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-700"><AdminText ar={error} en="Assignment rules could not be loaded. No fallback empty state is shown." /><AdminRetryButton /></div>
        ) : null}

        {!error && <div className="space-y-4">
          {rules.length === 0 ? (
            <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-muted)]"><AdminText ar="لا توجد قواعد تعيين حالياً." en="There are no assignment rules." /></div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
                <p className="text-lg font-semibold text-[#334155]">{rule.service_type}</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]"><AdminText ar="الوزن" en="Weight" />: {rule.priority_weight}</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]"><AdminText ar="الحالة" en="Status" />: {rule.enabled ? <AdminText ar="مفعل" en="Enabled" /> : <AdminText ar="معطل" en="Disabled" />}</p>
              </div>
            ))
          )}
        </div>}
      </div>
    </div>
  );
}
