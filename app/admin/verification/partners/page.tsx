import { VerificationTable } from '@/components/admin/VerificationTable';
import { AdminText } from '@/components/admin/AdminLocale';

export const metadata = {
  title: 'Partner Verification | DIR3COM',
};

export default async function PartnerVerificationPage({ searchParams }: { searchParams: Promise<{ result?: string; error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold"><AdminText ar="تحقق الشركاء" en="Partner verification" /></h1>
        <p className="mt-2 text-[var(--color-muted)]"><AdminText ar="راجع هوية الشريك ومستندات الشركة والتراخيص وأدلة التأمين." en="Review partner identity, company documents, licenses, and insurance evidence." /></p>
        <div className="mt-6">
          <VerificationTable returnPath="/admin/verification/partners" result={params?.result} actionErrorCode={params?.error} />
        </div>
      </div>
    </main>
  );
}
