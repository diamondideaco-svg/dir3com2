import { getLifecycleStatusContract } from '@/lib/booking/workflow-status';

type BookingTimelineProps = {
  history: Array<{ id: string; status: string; notes?: string | null; created_at: string }>;
};

export default function BookingTimeline({ history }: BookingTimelineProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-lg font-semibold text-white">الجدول الزمني للحجز</h2>
      <div className="mt-5 space-y-4">
        {history.map((item) => (
          <div key={item.id} className="flex gap-3 rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
            <div className="mt-1 h-3 w-3 rounded-full bg-[#D4AF37]" />
            <div>
              <p className="font-semibold text-white">{getLifecycleStatusContract(item.status).customerVisibleStatus}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{new Date(item.created_at).toLocaleString('ar-SA')}</p>
              {item.notes ? <p className="mt-2 text-sm text-[var(--color-muted)]">{item.notes}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
