import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import CustomerTable from '@/components/customers/CustomerTable';
import CustomerForm from '@/components/customers/CustomerForm';
import type { CustomerRecord } from '@/lib/supabase/types';

async function getCustomers() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
  return (data || []) as CustomerRecord[];
}

export default async function AdminCustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">لوحة الإدارة</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">إدارة العملاء</h1>
          </div>
          <Link href="/admin" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <CustomerForm />
          <CustomerTable customers={customers} />
        </div>
      </div>
    </div>
  );
}
