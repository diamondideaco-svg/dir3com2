import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

type CustomerDocumentsProps = {
  documents: Array<{ id: string; document_type: string; file_url?: string | null }>;
  available?: boolean;
};

export default function CustomerDocuments({ documents, available = true }: CustomerDocumentsProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="المستندات" en="Documents" /></h3>
      <div className="mt-4 space-y-3">
        {!available ? (
          <div role="status" className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">
            <AdminText
              ar="تعذر تحميل مستندات العميل حاليًا. لم تُعرض حالة فارغة بديلة."
              en="Customer documents are currently unavailable. No fallback empty state is shown."
            />
            <AdminRetryButton />
          </div>
        ) : null}
        {available ? documents.map((document) => (
          <div key={document.id} className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4 text-sm text-[var(--color-muted)]">
            <p className="font-semibold text-white">{document.document_type}</p>
            <p className="mt-1">{document.file_url || '—'}</p>
          </div>
        )) : null}
        {available && documents.length === 0 ? <p className="text-sm text-[var(--color-muted)]"><AdminText ar="لا توجد مستندات." en="No documents." /></p> : null}
      </div>
    </div>
  );
}
