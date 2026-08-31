import { redirect } from 'next/navigation';
import MyDocumentsContent, { type VerificationDocumentRow } from '@/components/account/MyDocumentsContent';
import { resolveDocumentQuery } from '@/lib/customer/document-query';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

  const { data, error } = await supabase
    .from('verification_documents')
    .select('id, document_type, file_url, verification_status, verification_request_id, expiry_date, created_at, verification_requests(status)')
    .eq('owner_type', 'customer')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[my-documents] failed to load customer documents', { code: error.code });
  }

  return resolveDocumentQuery(data as VerificationDocumentRow[] | null, error);
}

export default async function MyDocumentsPage() {
  const documentsState = await getDocs();
  return <MyDocumentsContent documentsState={documentsState} />;
}
