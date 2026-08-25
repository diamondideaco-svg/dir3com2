export default function AdminPartnersLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 animate-pulse">
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="mt-3 h-8 w-60 rounded bg-slate-200" />
        </div>
        <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 animate-pulse">
          <div className="h-6 w-44 rounded bg-slate-200" />
          <div className="mt-6 space-y-3">
            <div className="h-10 rounded bg-slate-200" />
            <div className="h-10 rounded bg-slate-200" />
            <div className="h-10 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
