type CustomerDocumentsProps = {
  documents: Array<{ id: string; document_type: string; file_url?: string | null }>;
};

export default function CustomerDocuments({ documents }: CustomerDocumentsProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right">
      <h3 className="text-lg font-semibold text-white">المستندات</h3>
      <div className="mt-4 space-y-3">
        {documents.map((document) => (
          <div key={document.id} className="rounded-2xl border border-white/10 bg-[#07111D] p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">{document.document_type}</p>
            <p className="mt-1">{document.file_url || '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
