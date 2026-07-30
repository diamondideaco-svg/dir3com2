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
  const { data } = await supabase.from('assignment_rules').select('*').order('created_at', { ascending: false });
  return (data ?? []) as AssignmentRule[];
}

export default async function AssignmentRulesPage() {
  const rules = await getRules();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">القواعد</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">قواعد التعيين</h1>
          </div>
          <Link href="/admin/assignment" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>

        <div className="space-y-4">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-semibold text-white">{rule.service_type}</p>
              <p className="mt-2 text-sm text-slate-300">الوزن: {rule.priority_weight}</p>
              <p className="mt-2 text-sm text-slate-300">الحالة: {rule.enabled ? 'مفعل' : 'معطل'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
