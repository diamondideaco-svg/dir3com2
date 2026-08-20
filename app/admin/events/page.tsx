import { EventLogTable } from '@/components/admin/EventLogTable';

export const metadata = {
  title: 'System Events | DIR3COM',
};

export default function EventsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">System events</h1>
        <p className="mt-2 text-[var(--color-muted)]">Monitor event-driven workflows such as customer creation, bookings, settlements, and verification events.</p>
        <div className="mt-6">
          <EventLogTable />
        </div>
      </div>
    </main>
  );
}
