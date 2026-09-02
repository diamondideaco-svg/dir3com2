import Link from 'next/link';
import type { PartnerRecord } from '@/lib/supabase/types';
import PartnerStatusBadge from './PartnerStatusBadge';
import ShieldLevelBadge from './ShieldLevelBadge';
import { AdminText } from '@/components/admin/AdminLocale';

type PartnerTableProps = {
  partners: PartnerRecord[];
};

export default function PartnerTable({ partners }: PartnerTableProps) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-4">
        <h2 className="text-lg font-semibold text-white"><AdminText ar="قائمة الشركاء" en="Partner list" /></h2>
        <Link href="/admin/partners/new" className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#334155]"><AdminText ar="إضافة شريك" en="Add partner" /></Link>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-start">
          <thead className="bg-white text-sm text-[var(--color-muted)]">
            <tr>
              <th className="px-5 py-3 font-medium"><AdminText ar="الشركة" en="Company" /></th>
              <th className="px-5 py-3 font-medium"><AdminText ar="الشخص المسؤول" en="Contact" /></th>
              <th className="px-5 py-3 font-medium"><AdminText ar="البريد" en="Email" /></th>
              <th className="px-5 py-3 font-medium"><AdminText ar="الحالة" en="Status" /></th>
              <th className="px-5 py-3 font-medium"><AdminText ar="المستوى" en="Level" /></th>
              <th className="px-5 py-3 font-medium"><AdminText ar="الإجراء" en="Action" /></th>
            </tr>
          </thead>
          <tbody>
            {partners.length === 0 ? (
              <tr className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
                <td colSpan={6} className="px-5 py-8 text-center text-[var(--color-muted)]"><AdminText ar="لا توجد سجلات شركاء حالياً." en="There are no partner records." /></td>
              </tr>
            ) : (
              partners.map((partner) => (
                <tr key={partner.id} className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
                  <td className="px-5 py-4">{partner.company_name}</td>
                  <td className="px-5 py-4">{partner.contact_person}</td>
                  <td className="px-5 py-4">{partner.email}</td>
                  <td className="px-5 py-4"><PartnerStatusBadge status={partner.status} /></td>
                  <td className="px-5 py-4"><ShieldLevelBadge level={partner.shield_level} /></td>
                  <td className="px-5 py-4">
                    <Link href={`/admin/partners/${partner.id}`} className="text-[#D4AF37] hover:underline"><AdminText ar="تفاصيل" en="Details" /></Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
