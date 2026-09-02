import Link from 'next/link';
import { requireAdminPageDataAccess } from '@/lib/auth/admin';
import AssignmentLogTable from '@/components/assignment/AssignmentLogTable';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

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
  const { supabase } = await requireAdminPageDataAccess('/admin/assignment/logs');
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
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="السجلات" en="Logs" /></p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]"><AdminText ar="سجل التعيينات" en="Assignment log" /></h1>
          </div>
          <Link href="/admin/assignment" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="العودة" en="Back" /></Link>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-700"><AdminText ar={error} en="Assignment logs could not be loaded. No fallback empty state is shown." /><AdminRetryButton /></div>
        ) : null}

        {!error && <AssignmentLogTable logs={logs} />}
      </div>
    </div>
  );
}
