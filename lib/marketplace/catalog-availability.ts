import type { MarketplacePrimaryAction } from './truth';

/** Public catalogue summary, not a reservation or confirmation for selected dates. */
export type CatalogAvailabilityRow = {
  product_id: string;
  date: string;
  available: boolean | null;
  availability_status?: string | null;
  capacity: number | null;
  booked_count: number | null;
  synthetic: boolean | null;
  environment?: string | null;
};

export function catalogRequestAction(action: MarketplacePrimaryAction, availability?: string | null): MarketplacePrimaryAction {
  if (action === 'unavailable' || action === 'none') return action;
  if (availability === 'sold-out') return 'unavailable';
  if (availability !== 'available' && availability !== 'limited') return 'view_details';
  return action;
}

export function summarizeCatalogAvailability(rows: CatalogAvailabilityRow[], productId: string, today: string) {
  const eligible = rows.filter((row) => row.product_id === productId && row.synthetic === false &&
    (row.environment == null || row.environment === 'production') &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!eligible.length) return { availability_status: 'unknown', inventory_count: 0 } as const;

  // Use the nearest recorded date. Never sum daily capacity into a stock count.
  const row = eligible[0];
  const countKnown = Number.isInteger(row.capacity) && Number.isInteger(row.booked_count) &&
    row.capacity! >= 0 && row.booked_count! >= 0;
  const remaining = countKnown ? Math.max(0, row.capacity! - row.booked_count!) : 0;
  const status = row.availability_status?.toLowerCase().replace(/_/g, '-');
  if (row.available === false || (countKnown && remaining === 0) ||
    ['sold-out', 'unavailable', 'full', 'maintenance', 'blackout'].includes(status ?? '')) {
    return { availability_status: 'sold-out', inventory_count: 0 } as const;
  }
  if (row.available !== true || (status && !['available', 'limited', 'partially-booked'].includes(status))) {
    return { availability_status: 'unknown', inventory_count: 0 } as const;
  }
  return {
    availability_status: status === 'limited' || status === 'partially-booked' ? 'limited' : 'available',
    // Zero means no authoritative count supplied; it is not inferred from products.
    inventory_count: remaining,
  } as const;
}
