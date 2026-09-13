import Link from 'next/link';
import { notFound } from 'next/navigation';
import PartnerForm from '@/components/admin/PartnerForm';
import { isCountryAllowed, requireScopedAdminPageDataAccess, scopeCountryQuery } from '@/lib/auth/admin';
import type { PartnerRecord } from '@/lib/supabase/types';
import { AdminStatusText, AdminText } from '@/components/admin/AdminLocale';
import PartnerActivation from '@/components/admin/PartnerActivation';

async function getPartner(id: string) {
  const { supabase, scope } = await requireScopedAdminPageDataAccess(`/admin/partners/${id}`, 'partners:read');
  const { data, error } = await scopeCountryQuery(supabase.from('partners').select('*').eq('id', id), scope).maybeSingle();
  if (error) throw new Error(`Partner query failed: ${error.message}`);
  if (!data) return null;
  if (!isCountryAllowed(scope, data.country)) notFound();
  return { partner: data as PartnerRecord, canActivate: scope.mode === 'global' };
}

export default async function PartnerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPartner(id);

  if (!result) {
    return <div className="min-h-screen bg-[#F8FAFC] p-6 text-[#0D1B2A]"><AdminText ar="الشريك غير موجود." en="Partner not found." /></div>;
  }
  const { partner, canActivate } = result;
  const incomplete = [
    !partner.country,
    !partner.city,
    !partner.phone,
    !partner.commercial_registration,
    !partner.contact_person?.trim(),
    (partner.company_name ?? '').trim().toLowerCase() === (partner.contact_person ?? '').trim().toLowerCase(),
  ].some(Boolean);

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-6 text-[#0D1B2A] sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex min-w-0 flex-wrap items-start justify-between gap-4 rounded-[1.5rem] border border-[#E2E8F0] bg-white p-5 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#A67C00]"><AdminText ar="تفاصيل الشريك" en="Partner details" /></p>
            <h1 className="mt-2 break-words text-2xl font-semibold text-[#0D1B2A] sm:text-3xl">{partner.company_name || '—'}</h1>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/35 bg-[#FFFDF5] px-3 py-1.5 text-sm font-semibold text-[#6B7280]">
              <span className="h-2 w-2 rounded-full bg-[#D4AF37]" aria-hidden="true" />
              <AdminStatusText value={partner.status} />
            </div>
          </div>
          <Link href="/admin/partners" className="inline-flex min-h-11 items-center rounded-full border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-semibold text-[#0D1B2A]">
            <AdminText ar="العودة" en="Back" />
          </Link>
        </div>

        {incomplete ? (
          <div role="status" className="mb-6 rounded-[1.25rem] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <p className="font-semibold"><AdminText ar="بيانات ملف الشريك غير مكتملة" en="Partner profile data is incomplete" /></p>
            <p className="mt-1"><AdminText
              ar="هذه البيانات معروضة كما هي من قاعدة البيانات؛ لم نملأ حقولاً أو نفترض اسم شركة أو دولة. راجع الحقول قبل أي اعتماد تشغيلي."
              en="These values are shown exactly as stored; no company name, country, or other business data is inferred. Review the fields before operational approval."
            /></p>
          </div>
        ) : null}

        <PartnerActivation partnerId={partner.id} status={partner.status} updatedAt={partner.updated_at} canActivate={canActivate} />
        <PartnerForm initialData={partner} />
      </div>
    </div>
  );
}
