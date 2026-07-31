import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type VerificationDocumentRow = {
  id: string;
  document_type: string;
  file_url: string | null;
  verification_status: string;
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
    .select('id, document_type, file_url, verification_status, expiry_date, created_at')
    .eq('owner_type', 'customer')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  return (data || []) as VerificationDocumentRow[];
}

export default async function MyDocumentsPage() {
  const documents = await getDocs();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">مستنداتي</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">المستندات</h1>
          </div>
          <Link href="/my-account" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>
        <div className="space-y-4">
          {documents.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
              لا توجد مستندات مرتبطة بحسابك حالياً.
            </div>
          ) : (
            documents.map((document) => (
              <div key={document.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-white">{document.document_type}</p>
                  <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-xs text-[#D4AF37]">{document.verification_status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300 break-all">{document.file_url || '—'}</p>
                <p className="mt-2 text-xs text-slate-400">تاريخ الانتهاء: {document.expiry_date ? new Date(document.expiry_date).toLocaleDateString('ar-SA') : 'غير محدد'}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
