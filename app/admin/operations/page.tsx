import { OperationSummaryCards } from '@/components/admin/OperationSummaryCards';
import { NotificationTable } from '@/components/admin/NotificationTable';
import { AuditTable } from '@/components/admin/AuditTable';
import { Timeline } from '@/components/admin/Timeline';
import { EventLogTable } from '@/components/admin/EventLogTable';

export const metadata = {
  title: 'Operations Engine | DIR3COM',
};

export default function OperationsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gold-400">DIR3 Operations Engine</p>
          <h1 className="mt-2 text-3xl font-semibold">Notifications, audit, timeline, and system events</h1>
          <p className="mt-3 max-w-3xl text-slate-400">Every important action in the platform is now traceable through one operational backbone.</p>
        </div>

        <OperationSummaryCards />

        <div className="grid gap-6 lg:grid-cols-2">
          <NotificationTable />
          <AuditTable />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Timeline />
          <EventLogTable />
        </div>
      </div>
    </main>
  );
}
