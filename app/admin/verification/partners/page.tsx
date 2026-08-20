import { VerificationTable } from '@/components/admin/VerificationTable';

export const metadata = {
  title: 'Partner Verification | DIR3COM',
};

export default async function PartnerVerificationPage({ searchParams }: { searchParams: Promise<{ result?: string; error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">Partner verification</h1>
        <p className="mt-2 text-[var(--color-muted)]">Review partner identity, company documents, licenses, and insurance evidence.</p>
        <div className="mt-6">
          <VerificationTable returnPath="/admin/verification/partners" result={params?.result} actionErrorCode={params?.error} />
        </div>
      </div>
    </main>
  );
}
