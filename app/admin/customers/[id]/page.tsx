import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import CustomerProfile from '@/components/customers/CustomerProfile';
import CustomerShieldBadge from '@/components/customers/CustomerShieldBadge';
import CustomerTimeline from '@/components/customers/CustomerTimeline';
import CustomerDocuments from '@/components/customers/CustomerDocuments';
import type { CustomerRecord, CustomerActivityRecord, CustomerDocumentRecord } from '@/lib/supabase/types';

async function getCustomer(id: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: customerData }, { data: activityData }, { data: documentData }] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).single(),
    supabase.from('customer_activity').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    supabase.from('customer_documents').select('*').eq('customer_id', id).order('uploaded_at', { ascending: false }),
  ]);

  return {
    customer: (customerData || null) as CustomerRecord | null,
    activity: (activityData || []) as CustomerActivityRecord[],
    documents: (documentData || []) as CustomerDocumentRecord[],
  };
}

export default async function AdminCustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { customer, activity, documents } = await getCustomer(id);

  if (!customer) {
    return <div className="min-h-screen bg-[#0D1B2A] p-10 text-white">العميل غير موجود.</div>;
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">تفاصيل العميل</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{customer.full_name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <CustomerShieldBadge shieldLevel={customer.shield_level} />
            <Link href="/admin/customers" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">العودة</Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <CustomerProfile customer={customer} />
          <CustomerDocuments documents={documents} />
        </div>
        <div className="mt-6">
          <CustomerTimeline items={activity} />
        </div>
      </div>
    </div>
  );
}
