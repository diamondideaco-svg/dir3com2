export function DocumentViewer({ documentType, fileUrl }: { documentType: string; fileUrl?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Document preview</h3>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{documentType}</p>
      {fileUrl ? (
        <a href={fileUrl} className="mt-3 inline-block text-sm text-gold-400">Open document</a>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No document uploaded yet.</p>
      )}
    </div>
  );
}
