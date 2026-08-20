type CustomerTimelineProps = {
  items: Array<{ id: string; activity_type: string; details?: string | null; created_at: string }>;
};

export default function CustomerTimeline({ items }: CustomerTimelineProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 text-right">
      <h3 className="text-lg font-semibold text-white">الجدول الزمني</h3>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
            <p className="text-sm font-semibold text-white">{item.activity_type}</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{item.details || '—'}</p>
            <p className="mt-2 text-xs text-slate-500">{new Date(item.created_at).toLocaleString('ar-SA')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
