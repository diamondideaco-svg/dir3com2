import { AdminDateTime, AdminText } from '@/components/admin/AdminLocale';

type CustomerTimelineProps = {
  items: Array<{ id: string; activity_type: string; details?: string | null; created_at: string }>;
};

export default function CustomerTimeline({ items }: CustomerTimelineProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="الجدول الزمني" en="Timeline" /></h3>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
            <p className="text-sm font-semibold text-white">{item.activity_type}</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{item.details || '—'}</p>
            <p className="mt-2 text-xs text-slate-500"><AdminDateTime value={item.created_at} /></p>
          </div>
        ))}
        {items.length === 0 ? <p className="text-sm text-[var(--color-muted)]"><AdminText ar="لا يوجد نشاط حتى الآن." en="No activity yet." /></p> : null}
      </div>
    </div>
  );
}
