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
  const { data } = await supabase.from('assignment_logs').select('*').order('created_at', { ascending: false });
  return (data ?? []) as AssignmentLog[];
}

export default async function AssignmentLogsPage() {
  const logs = await getLogs();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">السجلات</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">سجل التعيينات</h1>
          </div>
          <Link href="/admin/assignment" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>

        <AssignmentLogTable logs={logs} />
      </div>
    </div>
  );
}
