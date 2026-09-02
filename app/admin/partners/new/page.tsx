import Link from 'next/link';
import PartnerForm from '@/components/admin/PartnerForm';
import { AdminText } from '@/components/admin/AdminLocale';

export default function NewPartnerPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="الشركاء" en="Partners" /></p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]"><AdminText ar="إضافة شريك جديد" en="Add partner" /></h1>
          </div>
          <Link href="/admin/partners" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="العودة" en="Back" /></Link>
        </div>
        <PartnerForm />
      </div>
    </div>
  );
}
