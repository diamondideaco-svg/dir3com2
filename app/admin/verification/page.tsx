import { VerificationCard } from '@/components/admin/VerificationCard';
import { VerificationTable } from '@/components/admin/VerificationTable';
import { VerificationDetails } from '@/components/admin/VerificationDetails';
import { AdminText } from '@/components/admin/AdminLocale';

export const metadata = {
  title: 'Verification Engine | DIR3COM',
};

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ result?: string; error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gold-400"><AdminText ar="محرك الهوية والتحقق DIR3" en="DIR3 Identity & Verification Engine" /></p>
          <h1 className="mt-2 text-3xl font-semibold"><AdminText ar="تحقق العملاء والشركاء والشركات والمستندات" en="Verify customers, partners, companies, and documents" /></h1>
          <p className="mt-3 max-w-3xl text-[var(--color-muted)]"><AdminText ar="تدعم طبقة التحقق الثقة والأهلية وتدرج مستوى الدرع والاستعداد للامتثال." en="The verification layer powers trust, eligibility, shield level progression, and compliance readiness." /></p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <VerificationCard />
          <VerificationDetails />
        </div>

        <VerificationTable returnPath="/admin/verification" result={params?.result} actionErrorCode={params?.error} />
      </div>
    </main>
  );
}
