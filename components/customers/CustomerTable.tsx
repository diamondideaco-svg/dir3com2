import type { CustomerRecord } from '@/lib/supabase/types';
import { AdminStatusText, AdminText, AdminUnavailableControl } from '@/components/admin/AdminLocale';

type CustomerTableProps = {
  customers: CustomerRecord[];
};

export default function CustomerTable({ customers }: CustomerTableProps) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]">
      <table className="min-w-full text-start">
        <thead className="bg-white text-sm text-[var(--color-muted)]">
          <tr>
            <th className="px-5 py-3"><AdminText ar="الاسم" en="Name" /></th>
            <th className="px-5 py-3"><AdminText ar="البريد" en="Email" /></th>
            <th className="px-5 py-3"><AdminText ar="المدينة" en="City" /></th>
            <th className="px-5 py-3"><AdminText ar="الحالة" en="Status" /></th>
            <th className="px-5 py-3"><AdminText ar="الإجراءات" en="Actions" /></th>
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 ? (
            <tr className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
              <td colSpan={5} className="px-5 py-8 text-center text-[var(--color-muted)]"><AdminText ar="لا توجد سجلات عملاء حالياً." en="There are no customer records." /></td>
            </tr>
          ) : (
            customers.map((customer) => (
              <tr key={customer.id} className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
                <td className="px-5 py-4">{customer.full_name}</td>
                <td className="px-5 py-4">{customer.email}</td>
                <td className="px-5 py-4">{customer.city || '—'}</td>
                <td className="px-5 py-4"><AdminStatusText value={customer.status || 'active'} /></td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <AdminUnavailableControl ar="رفع الدرجة" en="Upgrade level" reasonAr="تغيير الدرجة غير متاح حتى تُحفظ الحالة وسجل التدقيق ذرّياً." reasonEn="Level changes are unavailable until state and audit persist atomically." className="rounded-full bg-[#D4AF37] px-3 py-2 text-xs font-semibold text-[#334155]" />
                    <AdminUnavailableControl ar="تعطيل" en="Deactivate" reasonAr="التعطيل غير متاح حتى تُحفظ الحالة وسجل التدقيق ذرّياً." reasonEn="Deactivation is unavailable until state and audit persist atomically." className="rounded-full border border-[color:var(--color-border)] px-3 py-2 text-xs text-[var(--color-navy)]" />
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
