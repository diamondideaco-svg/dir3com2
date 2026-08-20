type SettlementCardProps = {
  settlement: { id: string; amount: number; currency?: string | null; settlement_status?: string | null; notes?: string | null; release_date?: string | null };
};

export default function SettlementCard({ settlement }: SettlementCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white">التسوية</h3>
      <p className="mt-3 text-sm text-[var(--color-muted)]">المبلغ: {settlement.amount} {settlement.currency || 'SAR'}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">الحالة: {settlement.settlement_status || 'pending'}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{settlement.notes || 'لا توجد ملاحظات.'}</p>
      {settlement.release_date ? <p className="mt-3 text-xs text-[var(--color-muted)]">{new Date(settlement.release_date).toLocaleString('ar-SA')}</p> : null}
    </div>
  );
}
