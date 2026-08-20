export function VerificationTimeline() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Verification timeline</h3>
      <div className="mt-4 space-y-3 text-sm text-[var(--color-muted)]">
        <div className="border-r border-gold-400/40 pr-3">Request created</div>
        <div className="border-r border-gold-400/40 pr-3">Document uploaded</div>
        <div className="border-r border-gold-400/40 pr-3">Review completed</div>
      </div>
    </div>
  );
}
