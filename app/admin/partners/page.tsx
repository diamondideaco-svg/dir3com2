import Link from 'next/link';
import PartnerTable from '@/components/admin/PartnerTable';
import { filterRowsByCountryScope, requireScopedAdminPageDataAccess } from '@/lib/auth/admin';
import type { PartnerRecord } from '@/lib/supabase/types';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

async function getPartners() {
  const { supabase, scope } = await requireScopedAdminPageDataAccess('/admin/partners', 'partners:read');
  const { data, error } = await supabase.from('partners').select('*').order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { partners: [] as PartnerRecord[], error: 'تعذر تحميل قائمة الشركاء حالياً.' };
  }

  const scoped = filterRowsByCountryScope(scope, (data || []) as PartnerRecord[]);
  return { partners: scoped as PartnerRecord[], error: null };
}

export default async function AdminPartnersPage() {
  const { partners, error } = await getPartners();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="لوحة الإدارة" en="Admin platform" /></p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]"><AdminText ar="إدارة الشركاء" en="Partner management" /></h1>
          </div>
          <Link href="/admin" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="العودة إلى لوحة التحكم" en="Back to dashboard" /></Link>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-700"><AdminText ar={error} en="Partner data could not be loaded. No fallback empty state is shown." /><AdminRetryButton /></div>
        ) : null}

        {!error && <PartnerTable partners={partners} />}
      </div>
    </div>
  );
}
