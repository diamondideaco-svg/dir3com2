import { AdminText } from '@/components/admin/AdminLocale';

type AssignmentLogTableProps = {
  logs: Array<{
    id: string;
    booking_id: string;
    partner_id?: string | null;
    score?: number | null;
    decision_reason?: string | null;
    assigned_by?: string | null;
    created_at: string;
  }>;
};

export default function AssignmentLogTable({ logs }: AssignmentLogTableProps) {
  if (!logs.length) {
    return <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-muted)]"><AdminText ar="لا توجد سجلات حتى الآن." en="No logs yet." /></div>;
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]">
      <table className="min-w-full text-start">
        <thead className="bg-white text-sm text-[var(--color-muted)]">
          <tr>
            <th className="px-5 py-3"><AdminText ar="الحجز" en="Booking" /></th>
            <th className="px-5 py-3"><AdminText ar="الشريك" en="Partner" /></th>
            <th className="px-5 py-3"><AdminText ar="النتيجة" en="Score" /></th>
            <th className="px-5 py-3"><AdminText ar="السبب" en="Reason" /></th>
            <th className="px-5 py-3"><AdminText ar="المشغل" en="Actor" /></th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
              <td className="px-5 py-4">{log.booking_id}</td>
              <td className="px-5 py-4">{log.partner_id || '—'}</td>
              <td className="px-5 py-4">{log.score ?? '—'}</td>
              <td className="px-5 py-4">{log.decision_reason || '—'}</td>
              <td className="px-5 py-4">{log.assigned_by || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
