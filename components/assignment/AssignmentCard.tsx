import { approveAssignmentAction, rejectAssignmentAction } from '@/lib/actions/assignment-actions';
import { bookingStatusFromAssignmentStatus, normalizeAssignmentStatus } from '@/lib/booking/workflow-status';
import ShieldScoreBadge from './ShieldScoreBadge';

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
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">الحجز</p>
          <p className="text-lg font-semibold text-white">{assignment.booking_reference || assignment.booking_id}</p>
        </div>
        <div>
          <p className="text-sm text-slate-400">الشريك</p>
          <p className="text-lg font-semibold text-white">{assignment.partner_name || assignment.partner_id || '—'}</p>
        </div>
        {typeof assignment.score === 'number' ? <ShieldScoreBadge score={assignment.score} /> : null}
      </div>

      <p className="mt-4 text-sm text-slate-300">{assignment.notes || 'لا توجد ملاحظات.'}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-white/10 px-3 py-1 text-slate-200">Assignment: {assignmentStatus}</span>
        <span className="rounded-full border border-white/10 px-3 py-1 text-slate-200">Booking: {lifecycleBookingStatus}</span>
      </div>
      <p className="mt-3 text-xs text-slate-400">{new Date(assignment.assigned_at).toLocaleString('ar-SA')}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <form action={approveAssignmentAction}>
          <input type="hidden" name="bookingId" value={assignment.booking_id} />
          <button type="submit" className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#334155]">الموافقة</button>
        </form>
        <form action={rejectAssignmentAction}>
          <input type="hidden" name="bookingId" value={assignment.booking_id} />
          <button type="submit" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">رفض</button>
        </form>
      </div>
    </div>
  );
}
