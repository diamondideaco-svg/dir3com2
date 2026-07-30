import { getOperationsSummary } from '@/lib/actions/operations-actions';

export async function OperationSummaryCards() {
  const summary = await getOperationsSummary();

  const cards = [
    { label: 'Notifications', value: summary.notifications.length },
    { label: 'Audit entries', value: summary.audits.length },
    { label: 'Timeline events', value: summary.timeline.length },
    { label: 'System events', value: summary.events.length },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
