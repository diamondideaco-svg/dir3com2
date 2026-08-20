import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type AssignmentRule = {
  id: string;
  service_type: string;
  priority_weight: number;
  enabled: boolean;
};

async function getRules() {
  const supabase = await createSupabaseServerClient();
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
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">القواعد</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">قواعد التعيين</h1>
          </div>
          <Link href="/admin/assignment" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
        ) : null}

        <div className="space-y-4">
          {rules.length === 0 ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-slate-300">لا توجد قواعد تعيين حالياً.</div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
                <p className="text-lg font-semibold text-white">{rule.service_type}</p>
                <p className="mt-2 text-sm text-slate-300">الوزن: {rule.priority_weight}</p>
                <p className="mt-2 text-sm text-slate-300">الحالة: {rule.enabled ? 'مفعل' : 'معطل'}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
