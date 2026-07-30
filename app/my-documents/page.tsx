import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CustomerDocumentRecord } from '@/lib/supabase/types';

async function getDocs() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('customer_documents').select('*').order('uploaded_at', { ascending: false });
  return (data || []) as CustomerDocumentRecord[];
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
          {documents.map((document) => (
            <div key={document.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-semibold text-white">{document.document_type}</p>
              <p className="mt-2 text-sm text-slate-300">{document.file_url || '—'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
