import { DocumentUploader } from '@/components/admin/DocumentUploader';
import { DocumentViewer } from '@/components/admin/DocumentViewer';
import { ExpiryWarningCard } from '@/components/admin/ExpiryWarningCard';
import { VerificationTimeline } from '@/components/admin/VerificationTimeline';

export const metadata = {
  title: 'Document Verification | DIR3COM',
};

export default function DocumentsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Document verification</h1>
          <p className="mt-2 text-[var(--color-muted)]">Manage passport, national ID, commercial registration, tourism license, insurance, banking, and tax documents.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <DocumentUploader />
          <DocumentViewer documentType="Passport" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ExpiryWarningCard daysUntilExpiry={14} />
          <VerificationTimeline />
        </div>
      </div>
    </main>
  );
}
