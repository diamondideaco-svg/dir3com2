import { registerCountries } from '../auth/register-contact';
import type { MarketplaceFamilyKey } from './data';

export const discoveryFamilies: readonly MarketplaceFamilyKey[] = ['dir3-drive', 'dir3-stay', 'dir3-vip', 'dir3-fly', 'dir3-concierge'];

/** Changing family is discovery, never consent to a new provider search. */
export function discoveryHref(family: MarketplaceFamilyKey | undefined, current: MarketplaceFamilyKey | undefined, search: string) {
  const source = new URLSearchParams(search);
  const params = family && family === current ? source : new URLSearchParams();
  if (!family || family !== current) for (const key of ['language', 'currency', 'destination']) {
    const value = source.get(key); if (value) params.set(key, value);
  }
  if (family) params.set('family', family); else params.delete('family');
  return `/marketplace${params.size ? `?${params}` : ''}`;
}

export type NationalityChoices = Record<'ar' | 'en', { code: string; label: string }[]>;

/** Compute in the server page and serialize both languages to the client.
 * ICU names/collation can differ by runtime; never regenerate options during hydration.
 * Reuse registration's country source; selection never depends on language/location. */
export function nationalityOptions(language: 'ar' | 'en') {
  const names = new Intl.DisplayNames([language], { type: 'region' });
  return registerCountries.map(code => ({ code, label: names.of(code) ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label, language));
}

export function stayFilterSearch(search: string, values: { sort: string; hotelName: string; maxPrice: string }) {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value); else params.delete(key);
  }
  return params.toString();
}
