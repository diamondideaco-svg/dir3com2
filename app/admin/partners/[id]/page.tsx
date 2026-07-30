import Link from 'next/link';
import PartnerForm from '@/components/admin/PartnerForm';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PartnerRecord } from '@/lib/supabase/types';

async function getPartner(id: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from('partners').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data as PartnerRecord;
}

export default async function PartnerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await getPartner(id);

  if (!partner) {
    return <div className="min-h-screen bg-[#0D1B2A] p-10 text-white">الشريك غير موجود.</div>;
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">تفاصيل الشريك</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{partner.company_name}</h1>
          </div>
          <Link href="/admin/partners" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>
        <PartnerForm initialData={partner} />
      </div>
    </div>
  );
}
