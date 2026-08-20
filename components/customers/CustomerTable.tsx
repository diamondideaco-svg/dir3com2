import type { CustomerRecord } from '@/lib/supabase/types';
import { deactivateCustomerAction, updateShieldLevelAction } from '@/lib/actions/customer-actions';

type CustomerTableProps = {
  customers: CustomerRecord[];
};

export default function CustomerTable({ customers }: CustomerTableProps) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]">
      <table className="min-w-full text-right">
        <thead className="bg-white text-sm text-[var(--color-muted)]">
          <tr>
            <th className="px-5 py-3">الاسم</th>
            <th className="px-5 py-3">البريد</th>
            <th className="px-5 py-3">المدينة</th>
            <th className="px-5 py-3">الحالة</th>
            <th className="px-5 py-3">الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 ? (
            <tr className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
              <td colSpan={5} className="px-5 py-8 text-center text-[var(--color-muted)]">لا توجد سجلات عملاء حالياً.</td>
            </tr>
          ) : (
            customers.map((customer) => (
              <tr key={customer.id} className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
                <td className="px-5 py-4">{customer.full_name}</td>
                <td className="px-5 py-4">{customer.email}</td>
                <td className="px-5 py-4">{customer.city || '—'}</td>
                <td className="px-5 py-4">{customer.status || 'active'}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <form action={updateShieldLevelAction}>
                      <input type="hidden" name="id" value={customer.id} />
                      <input type="hidden" name="shieldLevel" value="DIR3 Elite Shield" />
                      <button type="submit" className="rounded-full bg-[#D4AF37] px-3 py-2 text-xs font-semibold text-[#334155]">رفع الدرجة</button>
                    </form>
                    <form action={deactivateCustomerAction}>
                      <input type="hidden" name="id" value={customer.id} />
                      <button type="submit" className="rounded-full border border-[color:var(--color-border)] px-3 py-2 text-xs text-[var(--color-navy)]">تعطيل</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
