import { getLifecycleStatusContract } from '@/lib/booking/workflow-status';

type BookingStatusBadgeProps = {
  status: string;
};

const toneMap: Record<string, string> = {
  Draft: 'bg-slate-500/15 text-slate-300',
  Pending: 'bg-amber-500/15 text-amber-300',
  Confirmed: 'bg-sky-500/15 text-sky-300',
  Assigned: 'bg-indigo-500/15 text-indigo-300',
  'In Progress': 'bg-cyan-500/15 text-cyan-300',
  Completed: 'bg-emerald-500/15 text-emerald-300',
  'Waiting Review': 'bg-fuchsia-500/15 text-fuchsia-300',
  'Settlement Released': 'bg-lime-500/15 text-lime-300',
  Cancelled: 'bg-rose-500/15 text-rose-300',
};

export default function BookingStatusBadge({ status }: BookingStatusBadgeProps) {
  const { customerVisibleStatus } = getLifecycleStatusContract(status);

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneMap[customerVisibleStatus] || 'bg-slate-500/15 text-slate-300'}`}>
      {customerVisibleStatus}
    </span>
  );
}
