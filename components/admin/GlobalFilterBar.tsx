export function GlobalFilterBar() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Global filters</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-400">Country</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-400">City</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-400">Service</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-400">Category</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-400">Shield Level</div>
        <div className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-400">Verification Status</div>
      </div>
    </div>
  );
}
