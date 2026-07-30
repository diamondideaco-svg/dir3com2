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
    return <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-slate-300">لا توجد سجلات حتى الآن.</div>;
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5">
      <table className="min-w-full text-right">
        <thead className="bg-[#07111D] text-sm text-slate-400">
          <tr>
            <th className="px-5 py-3">الحجز</th>
            <th className="px-5 py-3">الشريك</th>
            <th className="px-5 py-3">النتيجة</th>
            <th className="px-5 py-3">السبب</th>
            <th className="px-5 py-3">المشغل</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-t border-white/10 text-sm text-slate-300">
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
