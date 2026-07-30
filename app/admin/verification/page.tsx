import { VerificationCard } from '@/components/admin/VerificationCard';
import { VerificationTable } from '@/components/admin/VerificationTable';
import { VerificationDetails } from '@/components/admin/VerificationDetails';

export const metadata = {
  title: 'Verification Engine | DIR3COM',
};

export default function VerificationPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gold-400">DIR3 Identity & Verification Engine</p>
          <h1 className="mt-2 text-3xl font-semibold">Verify customers, partners, companies, and documents</h1>
          <p className="mt-3 max-w-3xl text-slate-400">The verification layer powers trust, eligibility, shield level progression, and compliance readiness.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <VerificationCard />
          <VerificationDetails />
        </div>

        <VerificationTable />
      </div>
    </main>
  );
}
