import { requireAdminPageAccess } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/server';
import { updateMarketplaceRequestStatus } from '@/lib/actions/operations-actions';
import { logServerError } from '@/lib/security/safe-logger';
import { AdminDateTime, AdminLocalizedInput, AdminStatusText, AdminSubmitButton, AdminText } from '@/components/admin/AdminLocale';

const managedStatuses = ['under_review', 'awaiting_supplier', 'confirmed', 'declined', 'cancelled'] as const;

export async function MarketplaceRequestOperationsTable() {
  await requireAdminPageAccess('/admin/operations');
  const { data, error } = supabaseAdmin
    ? await supabaseAdmin
        .from('marketplace_requests')
        .select('id, request_reference, user_id, product_id, request_type, service_name, supplier_name, marketplace_family, requested_for, traveller_count, fulfilment_method, transaction_method, handoff_type, status, next_action, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [], error: new Error('Marketplace request operations data source is unavailable.') };

  if (error) {
    logServerError('admin.operations.marketplace_requests_read_failed', error);
    throw new Error('Unable to load marketplace revenue requests.');
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-xl font-semibold"><AdminText ar="طلبات الإيرادات" en="Revenue requests" /></h2>
      <p className="mt-2 text-sm text-slate-400"><AdminText ar="يبقى العميل والمورّد والخدمة والتسليم والحالة والإجراء التالي قابلة للتتبع داخل dir3com." en="Customer, supplier, service, handoff, status, and the next operational action remain traceable inside dir3com." /></p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-start text-sm">
          <thead className="text-slate-400"><tr><th className="p-2"><AdminText ar="المرجع / العميل" en="Reference / customer" /></th><th className="p-2"><AdminText ar="الخدمة / المورّد" en="Service / supplier" /></th><th className="p-2"><AdminText ar="الطلب" en="Request" /></th><th className="p-2"><AdminText ar="التسليم" en="Handoff" /></th><th className="p-2"><AdminText ar="الحالة" en="Status" /></th><th className="p-2"><AdminText ar="الإجراء التالي" en="Next action" /></th><th className="p-2"><AdminText ar="أُنشئ" en="Created" /></th><th className="p-2"><AdminText ar="آخر تحديث" en="Last updated" /></th></tr></thead>
          <tbody>{(data ?? []).map((request) => <tr key={request.id} className="border-t border-white/10">
            <td className="p-2"><div className="font-semibold">{request.request_reference}</div><div className="text-xs text-slate-400">{request.user_id}</div></td>
            <td className="p-2"><div>{request.service_name ?? request.product_id}</div><div className="text-xs text-slate-400">{request.supplier_name ?? <AdminText ar="المورّد غير مسجل" en="Supplier not recorded" />}</div></td>
            <td className="p-2"><div>{request.marketplace_family ?? '—'} · {request.traveller_count} <AdminText ar="مسافر" en="traveller(s)" /></div><div className="text-xs text-slate-400">{request.requested_for ? <AdminDateTime value={request.requested_for} /> : <AdminText ar="التاريخ غير مقدم" en="Date not supplied" />}</div></td>
            <td className="p-2">{request.handoff_type === 'none' ? request.transaction_method : request.handoff_type}</td>
            <td className="p-2">
              <div><AdminStatusText value={request.status} /></div>
              <form action={updateMarketplaceRequestStatus} className="mt-2 grid min-w-56 gap-2">
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="expectedStatus" value={request.status} />
                <select name="status" defaultValue={request.status} className="rounded bg-slate-900 px-2 py-1 text-xs">
                  {!managedStatuses.includes(request.status as (typeof managedStatuses)[number]) && <option value={request.status}>{request.status}</option>}
                  <option value="under_review"><AdminText ar="قيد المراجعة" en="Under review" /></option>
                  <option value="awaiting_supplier"><AdminText ar="بانتظار المورّد" en="Awaiting supplier" /></option>
                  <option value="confirmed"><AdminText ar="مؤكد" en="Confirmed" /></option>
                  <option value="declined"><AdminText ar="مرفوض" en="Declined" /></option>
                  <option value="cancelled"><AdminText ar="ملغي" en="Cancelled" /></option>
                </select>
                <select name="confirmationSource" defaultValue="" className="rounded bg-slate-900 px-2 py-1 text-xs">
                  <option value=""><AdminText ar="مصدر التأكيد (مطلوب للتأكيد)" en="Confirmation source (required for Confirmed)" /></option>
                  <option value="supplier"><AdminText ar="المورّد" en="Supplier" /></option>
                  <option value="provider"><AdminText ar="المزوّد" en="Provider" /></option>
                </select>
                <AdminLocalizedInput name="confirmationReference" ar="مرجع تأكيد المورّد/المزوّد" en="Supplier/provider confirmation reference" className="rounded bg-slate-900 px-2 py-1 text-xs" />
                <AdminLocalizedInput name="paymentReference" ar="مرجع إثبات الدفع المتحقق" en="Verified payment evidence reference" className="rounded bg-slate-900 px-2 py-1 text-xs" />
                {request.request_type === 'request_quote' && <AdminLocalizedInput name="quoteReference" ar="مرجع عرض السعر المقبول" en="Accepted quote reference" className="rounded bg-slate-900 px-2 py-1 text-xs" />}
                <AdminSubmitButton ar="تحديث" en="Update" confirmAr="تطبيق انتقال الحالة هذا؟" confirmEn="Apply this status transition?" className="rounded bg-gold-400 px-2 py-1 text-xs font-semibold text-slate-950" />
              </form>
            </td>
            <td className="p-2">{request.next_action ?? '—'}</td>
            <td className="p-2"><AdminDateTime value={request.created_at} /></td>
            <td className="p-2"><AdminDateTime value={request.updated_at} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
