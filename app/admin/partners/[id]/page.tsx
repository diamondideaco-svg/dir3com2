import Link from 'next/link';
import { notFound } from 'next/navigation';
import PartnerForm from '@/components/admin/PartnerForm';
import { isCountryAllowed, requireScopedAdminPageDataAccess } from '@/lib/auth/admin';
import type { PartnerRecord } from '@/lib/supabase/types';
import { AdminText } from '@/components/admin/AdminLocale';

async function getPartner(id: string) {
  const { supabase, scope } = await requireScopedAdminPageDataAccess(`/admin/partners/${id}`, 'partners:read');
  const { data, error } = await supabase.from('partners').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Partner query failed: ${error.message}`);
  if (!data) return null;
  if (!isCountryAllowed(scope, data.country)) notFound();
  return data as PartnerRecord;
}

export default async function PartnerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await getPartner(id);

  if (!partner) {
    return <div className="min-h-screen bg-[#0D1B2A] p-10 text-white"><AdminText ar="الشريك غير موجود." en="Partner not found." /></div>;
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="تفاصيل الشريك" en="Partner details" /></p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{partner.company_name}</h1>
          </div>
          <Link href="/admin/partners" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="العودة" en="Back" /></Link>
        </div>
        <PartnerForm initialData={partner} />
      </div>
    </div>
  );
}
