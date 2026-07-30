type PartnerAssignmentCardProps = {
  assignment: { id: string; partner_id?: string | null; assignment_status?: string | null; notes?: string | null; assigned_at: string };
};

export default function PartnerAssignmentCard({ assignment }: PartnerAssignmentCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold text-white">تعيين الشريك</h3>
      <p className="mt-3 text-sm text-slate-300">الشريك: {assignment.partner_id || '—'}</p>
      <p className="mt-2 text-sm text-slate-300">الحالة: {assignment.assignment_status || 'assigned'}</p>
      <p className="mt-2 text-sm text-slate-300">{assignment.notes || 'لا توجد ملاحظات.'}</p>
      <p className="mt-3 text-xs text-slate-400">{new Date(assignment.assigned_at).toLocaleString('ar-SA')}</p>
    </div>
  );
}
