export function GlobalFilterBar() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Global filters</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">Country</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">City</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">Service</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">Category</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">Shield Level</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">Verification Status</div>
      </div>
    </div>
  );
}
