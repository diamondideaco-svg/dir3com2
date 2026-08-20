type PartnerAssignmentCardProps = {
  assignment: { id: string; partner_id?: string | null; assignment_status?: string | null; notes?: string | null; assigned_at: string };
};

export default function PartnerAssignmentCard({ assignment }: PartnerAssignmentCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white">تعيين الشريك</h3>
      <p className="mt-3 text-sm text-[var(--color-muted)]">الشريك: {assignment.partner_id || '—'}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">الحالة: {assignment.assignment_status || 'assigned'}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{assignment.notes || 'لا توجد ملاحظات.'}</p>
      <p className="mt-3 text-xs text-[var(--color-muted)]">{new Date(assignment.assigned_at).toLocaleString('ar-SA')}</p>
    </div>
  );
}
