import { AuditTable } from '@/components/admin/AuditTable';

export const metadata = {
  title: 'Audit Trail | DIR3COM',
};

export default function AuditPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">Audit trail</h1>
        <p className="mt-2 text-[var(--color-muted)]">Track important changes, ownership updates, and sensitive actions across the platform.</p>
        <div className="mt-6">
          <AuditTable />
        </div>
      </div>
    </main>
  );
}
