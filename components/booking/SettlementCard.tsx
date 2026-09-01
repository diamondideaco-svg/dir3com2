import { AdminCurrency, AdminDateTime, AdminStatusText, AdminText } from '@/components/admin/AdminLocale';

type SettlementCardProps = {
  settlement: { id: string; amount: number; currency?: string | null; settlement_status?: string | null; notes?: string | null; release_date?: string | null };
};

export default function SettlementCard({ settlement }: SettlementCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="التسوية" en="Settlement" /></h3>
      <p className="mt-3 text-sm text-[var(--color-muted)]"><AdminText ar="المبلغ" en="Amount" />: <AdminCurrency value={settlement.amount} currency={settlement.currency || 'SAR'} /></p>
      <p className="mt-2 text-sm text-[var(--color-muted)]"><AdminText ar="الحالة" en="Status" />: <AdminStatusText value={settlement.settlement_status || 'pending'} /></p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{settlement.notes || <AdminText ar="لا توجد ملاحظات." en="No notes." />}</p>
      {settlement.release_date ? <p className="mt-3 text-xs text-[var(--color-muted)]"><AdminDateTime value={settlement.release_date} /></p> : null}
    </div>
  );
}
