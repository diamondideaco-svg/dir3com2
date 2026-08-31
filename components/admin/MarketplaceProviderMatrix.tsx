import { requireAdminPageAccess } from '@/lib/auth/admin';
import { getMarketplaceProviderActivationMatrix } from '@/lib/marketplace/provider-activation';

const headers = [
  'Provider', 'Family', 'Account', 'Test', 'Production', 'API', 'Affiliate/deep link', 'Commercial approval',
  'Commission / revenue', 'Checkout', 'Countries', 'Saudi', 'Egypt', 'Blocker', 'Owner', 'Next action',
] as const;

export async function MarketplaceProviderMatrix() {
  await requireAdminPageAccess('/admin/operations');
  const rows = getMarketplaceProviderActivationMatrix();

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-xl font-semibold">Marketplace provider activation</h2>
      <p className="mt-2 text-sm text-slate-400">Runtime configuration presence only. No credential value is rendered; blocked sources remain fail-closed.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1900px] text-left text-xs">
          <thead className="text-slate-400"><tr>{headers.map((header) => <th key={header} className="p-2">{header}</th>)}</tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={`${row.providerName}-${row.serviceFamily}`} className="border-t border-white/10 align-top">
              <td className="p-2 font-semibold">{row.providerName}</td><td className="p-2">{row.serviceFamily}</td><td className="p-2">{row.accountStatus}</td>
              <td className="p-2">{row.testAccess ? 'YES' : 'NO'}</td><td className="p-2">{row.productionAccess ? 'YES' : 'NO'}</td>
              <td className="p-2">{row.apiAccess ? 'YES' : 'NO'}</td><td className="p-2">{row.affiliateDeepLinkAccess ? 'YES' : 'NO'}</td>
              <td className="p-2">{row.commercialApproval}</td><td className="p-2">{row.commissionRevenueModel}</td><td className="p-2">{row.checkoutMode}</td>
              <td className="p-2">{row.countriesCovered}</td><td className="p-2">{row.saudiCoverage}</td><td className="p-2">{row.egyptCoverage}</td>
              <td className="p-2">{row.activationBlocker}</td><td className="p-2">{row.owner}</td><td className="p-2">{row.nextAction}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
