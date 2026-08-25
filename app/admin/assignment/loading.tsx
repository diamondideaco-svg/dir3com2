export default function AdminAssignmentLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 animate-pulse">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="mt-3 h-8 w-64 rounded bg-slate-200" />
        </div>
        <div className="space-y-4">
          <div className="h-32 rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]" />
          <div className="h-32 rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]" />
        </div>
      </div>
    </div>
  );
}