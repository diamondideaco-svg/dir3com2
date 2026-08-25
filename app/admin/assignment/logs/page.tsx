import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AssignmentLogTable from '@/components/assignment/AssignmentLogTable';

type AssignmentLog = {
  id: string;
  booking_id: string;
  partner_id?: string | null;
  score?: number | null;
  decision_reason?: string | null;
  assigned_by?: string | null;
  created_at: string;
};

async function getLogs() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('assignment_logs').select('*').order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { logs: [] as AssignmentLog[], error: 'تعذر تحميل سجل التعيين حالياً.' };
  }

  return { logs: (data ?? []) as AssignmentLog[], error: null };
}

export default async function AssignmentLogsPage() {
  const { logs, error } = await getLogs();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">السجلات</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]">سجل التعيينات</h1>
          </div>
          <Link href="/admin/assignment" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">العودة</Link>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <AssignmentLogTable logs={logs} />
      </div>
    </div>
  );
}
