import Link from 'next/link';
import PartnerTable from '@/components/admin/PartnerTable';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PartnerRecord } from '@/lib/supabase/types';

async function getPartners() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from('partners').select('*').order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { partners: [] as PartnerRecord[], error: 'تعذر تحميل قائمة الشركاء حالياً.' };
  }

  return { partners: (data || []) as PartnerRecord[], error: null };
}

export default async function AdminPartnersPage() {
  const { partners, error } = await getPartners();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">لوحة الإدارة</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]">إدارة الشركاء</h1>
          </div>
          <Link href="/admin" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">العودة إلى لوحة التحكم</Link>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <PartnerTable partners={partners} />
      </div>
    </div>
  );
}
