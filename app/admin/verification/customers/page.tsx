import { VerificationTable } from '@/components/admin/VerificationTable';

export const metadata = {
  title: 'Customer Verification | DIR3COM',
};

export default function CustomerVerificationPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">Customer verification</h1>
        <p className="mt-2 text-slate-400">Review identity, passport, and national ID requests for customer trust scoring.</p>
        <div className="mt-6">
          <VerificationTable />
        </div>
      </div>
    </main>
  );
}
