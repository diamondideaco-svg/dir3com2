import Link from 'next/link';
import { requireAdminPageDataAccess } from '@/lib/auth/admin';
import CustomerProfile from '@/components/customers/CustomerProfile';
import CustomerShieldBadge from '@/components/customers/CustomerShieldBadge';
import CustomerTimeline from '@/components/customers/CustomerTimeline';
import CustomerDocuments from '@/components/customers/CustomerDocuments';
import type { CustomerRecord, CustomerActivityRecord, CustomerDocumentRecord } from '@/lib/supabase/types';
import { AdminText } from '@/components/admin/AdminLocale';

async function getCustomer(id: string) {
  const { supabase } = await requireAdminPageDataAccess(`/admin/customers/${id}`);
  const { data: customerData, error: customerError } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();

  if (customerError) throw new Error(`Customer query failed: ${customerError.message}`);
  if (!customerData) return { customer: null, activity: [], activityAvailable: true, documents: [], documentsAvailable: true };

  const [{ data: activityData, error: activityError }, { data: documentData, error: documentError }] = await Promise.all([
    supabase.from('customer_activity').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    supabase.from('customer_documents').select('*').eq('customer_id', id).order('uploaded_at', { ascending: false }),
  ]);

  if (activityError) {
    console.error('[admin-customer-details] customer activity unavailable', {
      code: activityError.code ?? 'unknown',
    });
  }

  if (documentError) {
    console.error('[admin-customer-details] customer documents unavailable', {
      code: documentError.code ?? 'unknown',
    });
  }

  return {
    customer: customerData as CustomerRecord,
    activity: activityError ? [] : (activityData || []) as CustomerActivityRecord[],
    activityAvailable: !activityError,
    documents: documentError ? [] : (documentData || []) as CustomerDocumentRecord[],
    documentsAvailable: !documentError,
  };
}

export default async function AdminCustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { customer, activity, activityAvailable, documents, documentsAvailable } = await getCustomer(id);

  if (!customer) {
    return <div className="min-h-screen bg-[#0D1B2A] p-10 text-white"><AdminText ar="العميل غير موجود." en="Customer not found." /></div>;
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="تفاصيل العميل" en="Customer details" /></p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{customer.full_name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <CustomerShieldBadge shieldLevel={customer.shield_level} />
            <Link href="/admin/customers" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="العودة" en="Back" /></Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <CustomerProfile customer={customer} />
          <CustomerDocuments documents={documents} available={documentsAvailable} />
        </div>
        <div className="mt-6">
          <CustomerTimeline items={activity} available={activityAvailable} />
        </div>
      </div>
    </div>
  );
}
