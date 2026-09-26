import { resolveCanonicalServiceSlug, type CanonicalServiceSlug } from '../services/canonical';
import { isComingSoonMarketplaceFamily } from './launch-catalog';
import { canonicalCity, familyContextFields, partySize, validSearchDate } from './search-context';

/** Public navigation reuses launch truth; these labels never grant provider access. */
export function serviceEntryState(service: CanonicalServiceSlug, language: 'ar' | 'en') {
  const comingSoon = isComingSoonMarketplaceFamily(`dir3-${service}`);
  return {
    comingSoon,
    label: comingSoon ? (language === 'ar' ? 'قريبًا' : 'Coming soon')
      : service === 'stay' ? 'Sandbox Demo'
      : service === 'drive' ? (language === 'ar' ? 'طلب للتأكيد' : 'Request to confirm') : '',
  };
}

/** Fixed local destination, allowlisted preferences, never forward execution/proof/redirect flags.
 * Handoff is prefill, not a provider search. The canonical form owns final validation/submission.
 */
export function serviceEntryHref(service: CanonicalServiceSlug, source = new URLSearchParams()) {
  if (isComingSoonMarketplaceFamily(`dir3-${service}`)) return `/services/${service}`;
  const params = new URLSearchParams({ family: `dir3-${service}` });
  const fields = [...familyContextFields[service], 'language', 'currency', 'destination', 'query', 'q',
    ...(service === 'drive' ? ['pickup','dropoff','pickupAt','returnAt','mode','luggage'] : []),
    ...(service === 'stay' ? ['adults','nationality','inventory'] : [])];
  for (const field of fields) {
    const values = source.getAll(field);
    if (values.length !== 1 || !values[0] || values[0].length > 200 || /[\u0000-\u001f\u007f]/.test(values[0])) continue;
    const value = values[0];
    if (field === 'language' && !['ar','en'].includes(value)) continue;
    if (field === 'currency' && !['SAR','USD','EGP','EUR','AED'].includes(value)) continue;
    if (field === 'nationality' && !/^[A-Z]{2}$/.test(value)) continue;
    if (field === 'inventory' && value !== 'partners') continue;
    if (/Date$|^check(In|Out)$/.test(field) && !validSearchDate(value)) continue;
    params.set(field, value);
  }
  if (service === 'drive') {
    for (const [legacy, canonical] of [['pickupCity','pickup'],['dropoffCity','dropoff']] as const) {
      const city = canonicalCity(params.get(legacy) ?? undefined);
      if (!params.has(canonical) && city) params.set(canonical, city.en);
    }
    if (!params.has('pickup') && params.has('destination')) params.set('pickup', params.get('destination')!);
    // Date-only context remains date-only. No fabricated midnight/Cairo conversion.
  } else if (service === 'stay') {
    if (!params.has('destination') && params.has('city')) {
      const city = params.get('city')!;
      params.set('destination', canonicalCity(city)?.en ?? city);
    }
    if (!params.has('adults') && params.has('guests')) params.set('adults', params.get('guests')!);
    // Both Stay recipients need the party size. Do not restore service=stay:
    // that legacy marker would turn a dated Sandbox prefill into an automatic search.
    const travelers = partySize(params.get('adults') ?? undefined);
    if (travelers) params.set('travelers', String(travelers));
  } else {
    params.set('service', service);
  }
  return `/marketplace?${params}`;
}

export function publicServiceLink(href: string, label: string, language: 'ar' | 'en') {
  const slug = href.match(/^\/services\/([^/?#]+)$/)?.[1];
  const service = resolveCanonicalServiceSlug(slug);
  if (!service) return { href, label };
  const state = serviceEntryState(service, language);
  const badge = state.comingSoon || service === 'stay' ? state.label : '';
  return { href: serviceEntryHref(service), label: `${label}${badge ? ` · ${badge}` : ''}` };
}
