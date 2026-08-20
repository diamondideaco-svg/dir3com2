import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import CustomerTable from '@/components/customers/CustomerTable';
import CustomerForm from '@/components/customers/CustomerForm';
import type { CustomerRecord } from '@/lib/supabase/types';

const resultMessages: Record<string, string> = {
  created: 'تم إنشاء العميل بنجاح.',
  shield_updated: 'تم تحديث مستوى الدرع للعميل.',
  deactivated: 'تم تعطيل العميل بنجاح.',
};

async function getCustomers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { customers: [] as CustomerRecord[], error: 'تعذر تحميل بيانات العملاء حالياً.' };
  }

  return { customers: (data || []) as CustomerRecord[], error: null };
}

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { customers, error } = await getCustomers();
  const params = await searchParams;
  const resultMessage = params?.result ? resultMessages[params.result] : null;

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">لوحة الإدارة</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">إدارة العملاء</h1>
          </div>
          <Link href="/admin" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>

        {resultMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{resultMessage}</div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <CustomerForm />
          <CustomerTable customers={customers} />
        </div>
      </div>
    </div>
  );
}
