import { AdminDateTime, AdminStatusText, AdminText } from '@/components/admin/AdminLocale';

type PartnerAssignmentCardProps = {
  assignment: { id: string; partner_id?: string | null; assignment_status?: string | null; notes?: string | null; assigned_at: string };
};

export default function PartnerAssignmentCard({ assignment }: PartnerAssignmentCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="تعيين الشريك" en="Partner assignment" /></h3>
      <p className="mt-3 text-sm text-[var(--color-muted)]"><AdminText ar="الشريك" en="Partner" />: {assignment.partner_id || '—'}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]"><AdminText ar="الحالة" en="Status" />: <AdminStatusText value={assignment.assignment_status || 'assigned'} /></p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{assignment.notes || <AdminText ar="لا توجد ملاحظات." en="No notes." />}</p>
      <p className="mt-3 text-xs text-[var(--color-muted)]"><AdminDateTime value={assignment.assigned_at} /></p>
    </div>
  );
}
