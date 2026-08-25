import type { VipPartnerConfig } from '@/lib/travel/contracts';
import { updateVipPartnerConfigAction } from '@/lib/actions/vip-partner-actions';

const input = 'w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-slate-800';
export default function VipPartnerConfigForm({ config }: { config: VipPartnerConfig }) {
  return (
    <form action={updateVipPartnerConfigAction} className="space-y-5 rounded-3xl border border-amber-300 bg-amber-50 p-6" dir="ltr">
      <div className="rounded-xl bg-amber-200 p-4 font-bold text-amber-950">UNVERIFIED / TEST DATA — synthetic_test_placeholder — local development only</div>
      <input type="hidden" name="partnerId" value={config.partnerId} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Legal name"><input className={input} name="legalName" defaultValue={config.legalName} required /></Field>
        <Field label="Display name"><input className={input} name="displayName" defaultValue={config.displayName} required /></Field>
        <Field label="Service"><input className={input} value="DIR3 VIP" readOnly /></Field>
        <Field label="Currency"><input className={input} value="EGP" readOnly /></Field>
        <Field label="Operating hours"><input className={input} name="operatingHours" defaultValue={config.operatingHours} required /></Field>
        <Field label="Response SLA (minutes)"><input className={input} name="responseSlaMinutes" type="number" min="1" defaultValue={config.responseSlaMinutes} required /></Field>
        <Field label="Minimum lead time (hours)"><input className={input} name="minimumLeadTimeHours" type="number" min="1" defaultValue={config.minimumLeadTimeHours} required /></Field>
        <Field label="Quote validity (minutes)"><input className={input} name="quoteValidityMinutes" type="number" min="1" defaultValue={config.quoteValidityMinutes} required /></Field>
        <Field label="Booking method"><select className={input} name="bookingMethod" defaultValue={config.bookingMethod}><option value="partner_portal_confirmation">Partner portal confirmation</option><option value="admin_confirmed_request">Admin-confirmed request</option></select></Field>
        <Field label="Pricing model"><select className={input} name="pricingModel" defaultValue={config.pricingModel}><option value="fixed_test_fixture">Fixed test fixture</option><option value="request_quote">Request quote</option></select></Field>
        <Field label="Base price (synthetic EGP)"><input className={input} name="basePrice" type="number" min="1" defaultValue={config.basePrice} required /></Field>
        <Field label="Per-passenger price (synthetic EGP)"><input className={input} name="perPassengerPrice" type="number" min="1" defaultValue={config.perPassengerPrice} required /></Field>
        <Field label="Operational contact"><input className={input} name="operationalContact" defaultValue={config.operationalContact} required /></Field>
        <Field label="Escalation contact"><input className={input} name="escalationContact" defaultValue={config.escalationContact} required /></Field>
        <Field label="Status"><select className={input} name="status" defaultValue={config.status}><option value="ACTIVE_TEST_ONLY">ACTIVE_TEST_ONLY</option><option value="INACTIVE">INACTIVE</option></select></Field>
      </div>
      <Field label="Cities / airports (one per line)"><textarea className={input} name="coverage" rows={7} defaultValue={config.coverage.join('\n')} required /></Field>
      <Field label="Taxes / fees"><textarea className={input} name="taxAndFees" defaultValue={config.taxAndFees} required /></Field>
      <Field label="Cancellation policy"><textarea className={input} name="cancellationPolicy" rows={3} defaultValue={config.cancellationPolicy} required /></Field>
      <Field label="Amendment policy"><textarea className={input} name="amendmentPolicy" rows={3} defaultValue={config.amendmentPolicy} required /></Field>
      <Field label="Settlement model"><textarea className={input} name="settlementModel" rows={3} defaultValue={config.settlementModel} required /></Field>
      <button className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white" type="submit">Save isolated TEST configuration</button>
    </form>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-slate-700"><span className="mb-1 block">{label}</span>{children}</label>; }
