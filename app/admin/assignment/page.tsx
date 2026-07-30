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

async function getAssignments() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('partner_assignments').select('*').order('assigned_at', { ascending: false });
  return (data ?? []) as AssignmentRecord[];
}

export default async function AssignmentPage() {
  const assignments = await getAssignments();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
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

        <AssignmentTable assignments={assignments} />
      </div>
    </div>
  );
}
