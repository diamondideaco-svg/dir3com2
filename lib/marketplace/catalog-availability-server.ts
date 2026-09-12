import type { SupabaseClient } from '@supabase/supabase-js';
import { summarizeCatalogAvailability, type CatalogAvailabilityRow } from './catalog-availability';

export async function readCatalogAvailability(client: SupabaseClient, productIds: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = productIds.length ? await client.from('product_availability')
    .select('product_id,available,availability_status,date,capacity,booked_count,synthetic,environment')
    .in('product_id', productIds).eq('synthetic', false).gte('date', today)
    .order('date', { ascending: true }) : { data: [], error: null };
  const rows = error ? [] : (data ?? []) as CatalogAvailabilityRow[];
  return {
    failed: Boolean(error),
    byProduct: new Map(productIds.map((id) => [id, summarizeCatalogAvailability(rows, id, today)])),
  };
}

type PartnerLink = {
  product_id: string; partner_id: string; synthetic: boolean; environment?: string | null;
  partner: { id: string; status: string; synthetic: boolean; environment?: string | null; deleted_at?: string | null } | null;
};

export function approvedPartnerProductIds(links: PartnerLink[]) {
  return new Set(links.filter((link) => link.synthetic === false &&
    (link.environment == null || link.environment === 'production') &&
    Boolean(link.partner_id) && link.partner !== null && link.partner?.id === link.partner_id && link.partner.synthetic === false &&
    link.partner.deleted_at == null && (link.partner.environment == null || link.partner.environment === 'production') &&
    ['approved', 'active'].includes(link.partner.status)).map((link) => link.product_id));
}

/** Ownership/approval is independent of dated availability and supplier display names. */
export async function readApprovedPartnerProductIds(client: SupabaseClient, productIds: string[]) {
  const { data, error } = productIds.length ? await client.from('product_availability')
    .select('product_id,partner_id,synthetic,environment,partner:partners(id,status,synthetic,environment,deleted_at)')
    .in('product_id', productIds).eq('synthetic', false) : { data: [], error: null };
  return approvedPartnerProductIds(error ? [] : (data ?? []) as unknown as PartnerLink[]);
}
