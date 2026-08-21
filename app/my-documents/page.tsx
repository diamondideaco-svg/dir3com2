import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeVerificationStatus } from '@/lib/verification/status';

type VerificationDocumentRow = {
  id: string;
  document_type: string;
  file_url: string | null;
  verification_status: string;
  verification_request_id: string | null;
  verification_requests?: { status?: string | null } | null;
  expiry_date: string | null;
  created_at: string;
};

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getDocs() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget('/my-documents'));
  }

  const { data } = await supabase
    .from('verification_documents')
    .select('id, document_type, file_url, verification_status, verification_request_id, expiry_date, created_at, verification_requests(status)')
    .eq('owner_type', 'customer')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  return (data || []) as VerificationDocumentRow[];
}

export default async function MyDocumentsPage() {
  const documents = await getDocs();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">مستنداتي</p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--color-navy)]">المستندات</h1>
          </div>
          <Link href="/my-account" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">العودة</Link>
        </div>
        <div className="space-y-4">
          {documents.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
              لا توجد مستندات مرتبطة بحسابك حالياً.
            </div>
          ) : (
            documents.map((document) => {
              const resolvedStatus = normalizeVerificationStatus(document.verification_requests?.status ?? document.verification_status);

              return (
                <div key={document.id} className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-[var(--color-navy)]">{document.document_type}</p>
                    <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-xs text-[#D4AF37]">{resolvedStatus}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-muted)] break-all">{document.file_url || '—'}</p>
                  <p className="mt-2 text-xs text-[var(--color-muted)]">تاريخ الانتهاء: {document.expiry_date ? new Date(document.expiry_date).toLocaleDateString('ar-SA') : 'غير محدد'}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
