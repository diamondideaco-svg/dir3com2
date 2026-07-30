export function ExpiryWarningCard({ daysUntilExpiry }: { daysUntilExpiry: number }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
      <p className="text-sm text-amber-300">Expiry warning</p>
      <p className="mt-2 text-xl font-semibold text-white">{daysUntilExpiry} day(s) remaining</p>
    </div>
  );
}
