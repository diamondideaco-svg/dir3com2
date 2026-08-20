export default function AdminVerificationLoading() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="mb-8">
          <div className="h-4 w-64 rounded bg-slate-800" />
          <div className="mt-3 h-8 w-[34rem] rounded bg-slate-800" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-24 rounded-2xl border border-slate-800 bg-slate-900/70" />
          <div className="h-24 rounded-2xl border border-slate-800 bg-slate-900/70" />
        </div>
      </div>
    </main>
  );
}
