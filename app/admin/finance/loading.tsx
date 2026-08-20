export default function AdminFinanceLoading() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="mb-8">
          <div className="h-4 w-48 rounded bg-slate-800" />
          <div className="mt-3 h-8 w-96 rounded bg-slate-800" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 rounded-2xl border border-slate-800 bg-slate-900/70" />
          <div className="h-28 rounded-2xl border border-slate-800 bg-slate-900/70" />
          <div className="h-28 rounded-2xl border border-slate-800 bg-slate-900/70" />
        </div>
      </div>
    </main>
  );
}
