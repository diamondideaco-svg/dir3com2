import { requireAdminPageAccess } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/server';
import { updateMarketplaceRequestStatus } from '@/lib/actions/operations-actions';
import { logServerError } from '@/lib/security/safe-logger';

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
      <h2 className="text-xl font-semibold">Revenue requests</h2>
      <p className="mt-2 text-sm text-slate-400">Customer, supplier, service, handoff, status, and the next operational action remain traceable inside dir3com.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-400"><tr><th className="p-2">Reference / customer</th><th className="p-2">Service / supplier</th><th className="p-2">Request</th><th className="p-2">Handoff</th><th className="p-2">Status</th><th className="p-2">Next action</th><th className="p-2">Created</th><th className="p-2">Last updated</th></tr></thead>
          <tbody>{(data ?? []).map((request) => <tr key={request.id} className="border-t border-white/10">
            <td className="p-2"><div className="font-semibold">{request.request_reference}</div><div className="text-xs text-slate-400">{request.user_id}</div></td>
            <td className="p-2"><div>{request.service_name ?? request.product_id}</div><div className="text-xs text-slate-400">{request.supplier_name ?? 'Supplier not recorded'}</div></td>
            <td className="p-2"><div>{request.marketplace_family ?? '—'} · {request.traveller_count} traveller(s)</div><div className="text-xs text-slate-400">{request.requested_for ? new Date(request.requested_for).toLocaleString('en-GB') : 'Date not supplied'}</div></td>
            <td className="p-2">{request.handoff_type === 'none' ? request.transaction_method : request.handoff_type}</td>
            <td className="p-2">
              <div>{request.status}</div>
              <form action={updateMarketplaceRequestStatus} className="mt-2 grid min-w-56 gap-2">
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="expectedStatus" value={request.status} />
                <select name="status" defaultValue={request.status} className="rounded bg-slate-900 px-2 py-1 text-xs">
                  {!managedStatuses.includes(request.status as (typeof managedStatuses)[number]) && <option value={request.status}>{request.status}</option>}
                  <option value="under_review">Under review</option>
                  <option value="awaiting_supplier">Awaiting supplier</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="declined">Declined</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select name="confirmationSource" defaultValue="" className="rounded bg-slate-900 px-2 py-1 text-xs">
                  <option value="">Confirmation source (required for Confirmed)</option>
                  <option value="supplier">Supplier</option>
                  <option value="provider">Provider</option>
                </select>
                <input name="confirmationReference" placeholder="Supplier/provider confirmation reference" className="rounded bg-slate-900 px-2 py-1 text-xs" />
                <input name="paymentReference" placeholder="Verified payment evidence reference" className="rounded bg-slate-900 px-2 py-1 text-xs" />
                {request.request_type === 'request_quote' && <input name="quoteReference" placeholder="Accepted quote reference" className="rounded bg-slate-900 px-2 py-1 text-xs" />}
                <button type="submit" className="rounded bg-gold-400 px-2 py-1 text-xs font-semibold text-slate-950">Update</button>
              </form>
            </td>
            <td className="p-2">{request.next_action ?? '—'}</td>
            <td className="p-2">{new Date(request.created_at).toLocaleString('en-GB')}</td>
            <td className="p-2">{new Date(request.updated_at).toLocaleString('en-GB')}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
