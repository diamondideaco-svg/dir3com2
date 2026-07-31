import { supabaseAdmin } from '@/lib/supabase/server';

export type RawMarketplaceServiceRecord = {
  id?: string | number | null;
  slug?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  base_price?: number | null;
  currency?: string | null;
  status?: string | null;
  featured?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  products?: Array<{
    id?: string | number | null;
    price_per_unit?: number | null;
    region?: { name_ar?: string | null; name_en?: string | null } | null;
  }>;
};

type RawMarketplaceProductRecord = {
  id: string;
  slug?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  base_price?: number | null;
  currency?: string | null;
  status?: string | null;
  featured?: boolean | null;
  verified?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MarketplaceProviderResult = {
  source: 'supabase' | 'api' | 'fallback';
  services: RawMarketplaceServiceRecord[];
};

export interface MarketplaceProviderAdapter {
  id: 'supabase' | 'api' | 'fallback';
  fetchServices(): Promise<MarketplaceProviderResult | null>;
}

const servicesSelect = `
  *,
  products:products(
    id,
    price_per_unit,
    region:regions(name_ar,name_en)
  )
`;

export const supabaseMarketplaceAdapter: MarketplaceProviderAdapter = {
  id: 'supabase',
  async fetchServices() {
    if (!supabaseAdmin) {
      return null;
    }

    const [{ data: servicesData, error: servicesError }, { data: productsData, error: productsError }] = await Promise.all([
      supabaseAdmin.from('services').select(servicesSelect).order('created_at', { ascending: true }),
      supabaseAdmin
        .from('products')
        .select('id,slug,name_ar,name_en,description_ar,description_en,base_price,currency,status,featured,verified,created_at,updated_at')
        .in('status', ['published', 'active', 'featured'])
        .order('created_at', { ascending: true }),
    ]);

    if (servicesError && productsError) {
      return null;
    }

    const services = (servicesData ?? []) as RawMarketplaceServiceRecord[];
    const products = (productsData ?? []) as RawMarketplaceProductRecord[];

    const existingServiceKeys = new Set(
      services.map((service) => String(service.slug ?? service.id ?? '')).filter((key) => key.length > 0)
    );

    const productAsServices: RawMarketplaceServiceRecord[] = products
      .filter((product) => existingServiceKeys.has(String(product.slug ?? product.id)) === false)
      .map((product) => ({
        id: product.id,
        slug: product.slug,
        name_ar: product.name_ar,
        name_en: product.name_en,
        description_ar: product.description_ar,
        description_en: product.description_en,
        base_price: product.base_price,
        currency: product.currency,
        status: product.status,
        featured: Boolean(product.featured) || product.status === 'featured',
        created_at: product.created_at,
        updated_at: product.updated_at,
        products: [
          {
            id: product.id,
            price_per_unit: product.base_price ?? 0,
            region: null,
          },
        ],
      }));

    return {
      source: 'supabase',
      services: [...services, ...productAsServices],
    };
  },
};

export const apiMarketplaceAdapter: MarketplaceProviderAdapter = {
  id: 'api',
  async fetchServices() {
    // DEV-019: architecture placeholder for upcoming partner API integration.
    return null;
  },
};

export function getMarketplaceAdapters() {
  return [supabaseMarketplaceAdapter, apiMarketplaceAdapter] as const;
}
