import { bookingStatusFromAssignmentStatus, normalizeAssignmentStatus } from '@/lib/booking/workflow-status';
import ShieldScoreBadge from './ShieldScoreBadge';
import { AdminDateTime, AdminStatusText, AdminText, AdminUnavailableControl } from '@/components/admin/AdminLocale';

type AssignmentCardProps = {
  assignment: {
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
};

export default function AssignmentCard({ assignment }: AssignmentCardProps) {
  const assignmentStatus = normalizeAssignmentStatus(assignment.assignment_status) ?? 'assigned';
  const lifecycleBookingStatus = bookingStatusFromAssignmentStatus(assignmentStatus);

  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]"><AdminText ar="الحجز" en="Booking" /></p>
          <p className="text-lg font-semibold text-white">{assignment.booking_reference || assignment.booking_id}</p>
        </div>
        <div>
          <p className="text-sm text-[var(--color-muted)]"><AdminText ar="الشريك" en="Partner" /></p>
          <p className="text-lg font-semibold text-white">{assignment.partner_name || assignment.partner_id || '—'}</p>
        </div>
        {typeof assignment.score === 'number' ? <ShieldScoreBadge score={assignment.score} /> : null}
      </div>

      <p className="mt-4 text-sm text-[var(--color-muted)]">{assignment.notes || <AdminText ar="لا توجد ملاحظات." en="No notes." />}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-[var(--color-navy)]"><AdminText ar="التعيين" en="Assignment" />: <AdminStatusText value={assignmentStatus} /></span>
        <span className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-[var(--color-navy)]"><AdminText ar="الحجز" en="Booking" />: <AdminStatusText value={lifecycleBookingStatus} /></span>
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]"><AdminDateTime value={assignment.assigned_at} /></p>

      <div className="mt-5 flex flex-wrap gap-3">
        <AdminUnavailableControl ar="الموافقة" en="Approve" reasonAr="غير متاح حتى يصبح قرار التعيين وتدقيقه معاملة ذرّية واحدة." reasonEn="Unavailable until assignment decisions and their audit are one atomic transaction." className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#334155]" />
        <AdminUnavailableControl ar="رفض" en="Reject" reasonAr="غير متاح حتى يصبح قرار التعيين وتدقيقه معاملة ذرّية واحدة." reasonEn="Unavailable until assignment decisions and their audit are one atomic transaction." className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]" />
      </div>
    </div>
  );
}
