import Link from 'next/link';
import type { PartnerRecord } from '@/lib/supabase/types';
import PartnerStatusBadge from './PartnerStatusBadge';
import ShieldLevelBadge from './ShieldLevelBadge';

type PartnerTableProps = {
  partners: PartnerRecord[];
};

export default function PartnerTable({ partners }: PartnerTableProps) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="text-lg font-semibold text-white">قائمة الشركاء</h2>
        <Link href="/admin/partners/new" className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0D1B2A]">إضافة شريك</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right">
          <thead className="bg-[#07111D] text-sm text-slate-400">
            <tr>
              <th className="px-5 py-3 font-medium">الشركة</th>
              <th className="px-5 py-3 font-medium">الشخص المسؤول</th>
              <th className="px-5 py-3 font-medium">البريد</th>
              <th className="px-5 py-3 font-medium">الحالة</th>
              <th className="px-5 py-3 font-medium">المستوى</th>
              <th className="px-5 py-3 font-medium">الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {partners.length === 0 ? (
              <tr className="border-t border-white/10 text-sm text-slate-300">
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">لا توجد سجلات شركاء حالياً.</td>
              </tr>
            ) : (
              partners.map((partner) => (
                <tr key={partner.id} className="border-t border-white/10 text-sm text-slate-300">
                  <td className="px-5 py-4">{partner.company_name}</td>
                  <td className="px-5 py-4">{partner.contact_person}</td>
                  <td className="px-5 py-4">{partner.email}</td>
                  <td className="px-5 py-4"><PartnerStatusBadge status={partner.status} /></td>
                  <td className="px-5 py-4"><ShieldLevelBadge level={partner.shield_level} /></td>
                  <td className="px-5 py-4">
                    <Link href={`/admin/partners/${partner.id}`} className="text-[#D4AF37] hover:underline">تفاصيل</Link>
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
