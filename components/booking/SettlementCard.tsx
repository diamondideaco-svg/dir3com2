type SettlementCardProps = {
  settlement: { id: string; amount: number; currency?: string | null; settlement_status?: string | null; notes?: string | null; release_date?: string | null };
};

export default function SettlementCard({ settlement }: SettlementCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold text-white">التسوية</h3>
      <p className="mt-3 text-sm text-slate-300">المبلغ: {settlement.amount} {settlement.currency || 'SAR'}</p>
      <p className="mt-2 text-sm text-slate-300">الحالة: {settlement.settlement_status || 'pending'}</p>
      <p className="mt-2 text-sm text-slate-300">{settlement.notes || 'لا توجد ملاحظات.'}</p>
      {settlement.release_date ? <p className="mt-3 text-xs text-slate-400">{new Date(settlement.release_date).toLocaleString('ar-SA')}</p> : null}
    </div>
  );
}
