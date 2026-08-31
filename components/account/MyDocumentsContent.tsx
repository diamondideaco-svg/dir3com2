'use client';

import Link from 'next/link';

import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { DocumentQueryResult } from '@/lib/customer/document-query';
import {
  customerHubCopy,
  formatCustomerHubDate,
  getVerificationStatusLabel,
} from '@/lib/i18n/customer-hub';
import { normalizeVerificationStatus } from '@/lib/verification/status';

export type VerificationDocumentRow = {
  id: string;
  document_type: string;
  file_url: string | null;
  verification_status: string;
  verification_request_id: string | null;
  verification_requests?: { status?: string | null } | null;
  expiry_date: string | null;
  created_at: string;
};

export default function MyDocumentsContent({
  documentsState,
}: {
  documentsState: DocumentQueryResult<VerificationDocumentRow>;
}) {
  const { language, direction } = useLanguage();
  const t = customerHubCopy[language].documents;

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir={direction}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">{t.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{t.title}</h1>
          </div>
          <Link href="/my-account" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">{t.back}</Link>
        </div>
        <div className="space-y-4">
          {documentsState.status === 'error' ? (
            <div role="alert" className="rounded-[1.5rem] border border-red-300/40 bg-red-50 p-6 text-sm text-red-900">
              {t.error}
            </div>
          ) : documentsState.documents.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/20 bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
              {t.empty}
            </div>
          ) : (
            documentsState.documents.map((document) => {
              const resolvedStatus = normalizeVerificationStatus(document.verification_requests?.status ?? document.verification_status);

              return (
                <div key={document.id} className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-white">{document.document_type}</p>
                    <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-xs text-[#D4AF37]">
                      {getVerificationStatusLabel(resolvedStatus, language)}
                    </span>
                  </div>
                  <p className="mt-2 break-all text-sm text-[var(--color-muted)]">{document.file_url || '—'}</p>
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    {t.expiryDate}: {document.expiry_date ? formatCustomerHubDate(document.expiry_date, language) : t.notSpecified}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
