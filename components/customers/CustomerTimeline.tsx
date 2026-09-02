import { AdminDateTime, AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

type CustomerTimelineProps = {
  items: Array<{ id: string; activity_type: string; details?: string | null; created_at: string }>;
  available?: boolean;
};

export default function CustomerTimeline({ items, available = true }: CustomerTimelineProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="الجدول الزمني" en="Timeline" /></h3>
      <div className="mt-4 space-y-3">
        {!available ? (
          <div role="status" className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">
            <AdminText
              ar="تعذر تحميل سجل نشاط العميل حاليًا. لم تُعرض حالة فارغة بديلة."
              en="Customer activity is currently unavailable. No fallback empty state is shown."
            />
            <AdminRetryButton />
          </div>
        ) : null}
        {available ? items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
            <p className="text-sm font-semibold text-white">{item.activity_type}</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{item.details || '—'}</p>
            <p className="mt-2 text-xs text-slate-500"><AdminDateTime value={item.created_at} /></p>
          </div>
        )) : null}
        {available && items.length === 0 ? <p className="text-sm text-[var(--color-muted)]"><AdminText ar="لا يوجد نشاط حتى الآن." en="No activity yet." /></p> : null}
      </div>
    </div>
  );
}
