import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AssignmentTable from '@/components/assignment/AssignmentTable';

type AssignmentRecord = {
  id: string;
  booking_id: string;
  partner_id?: string | null;
  assignment_status?: string | null;
  notes?: string | null;
  assigned_at: string;
  booking_reference?: string;
  partner_name?: string;
  score?: number;
};

const resultMessages: Record<string, string> = {
  assignment_approved: 'تمت الموافقة على التعيين بنجاح.',
  assignment_rejected: 'تم رفض التعيين وإعادة الحجز للمراجعة.',
};

async function getAssignments() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('partner_assignments').select('*').order('assigned_at', { ascending: false });

  if (error) {
    console.error(error);
    return { assignments: [] as AssignmentRecord[], error: 'تعذر تحميل بيانات التعيين حالياً.' };
  }

  return { assignments: (data ?? []) as AssignmentRecord[], error: null };
}

export default async function AssignmentPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { assignments, error } = await getAssignments();
  const params = await searchParams;
  const resultMessage = params?.result ? resultMessages[params.result] : null;

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">Shield Assignment Engine</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">إدارة التعيينات</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/assignment/rules" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">القواعد</Link>
            <Link href="/admin/assignment/logs" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">السجلات</Link>
          </div>
        </div>

        {resultMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{resultMessage}</div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
        ) : null}

        <AssignmentTable assignments={assignments} />
      </div>
    </div>
  );
}
