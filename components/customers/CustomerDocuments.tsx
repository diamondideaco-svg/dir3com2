import { AdminText } from '@/components/admin/AdminLocale';

type CustomerDocumentsProps = {
  documents: Array<{ id: string; document_type: string; file_url?: string | null }>;
};

export default function CustomerDocuments({ documents }: CustomerDocumentsProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="المستندات" en="Documents" /></h3>
      <div className="mt-4 space-y-3">
        {documents.map((document) => (
          <div key={document.id} className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4 text-sm text-[var(--color-muted)]">
            <p className="font-semibold text-white">{document.document_type}</p>
            <p className="mt-1">{document.file_url || '—'}</p>
          </div>
        ))}
        {documents.length === 0 ? <p className="text-sm text-[var(--color-muted)]"><AdminText ar="لا توجد مستندات." en="No documents." /></p> : null}
      </div>
    </div>
  );
}
