import { supabaseAdmin } from '@/lib/supabase/server';
import { applyPublicCategoryFilters, applyPublicProductFilters, applyPublicServiceFilters } from '@/lib/marketplace/public-filters';

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
  marketplace_category?: string | null;
  category_slug?: string | null;
  category_name_en?: string | null;
  category_name_ar?: string | null;
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
  category_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RawMarketplaceProductCategoryRecord = {
  id: string;
  slug?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
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

    const [
      { data: servicesData, error: servicesError },
      { data: productsData, error: productsError },
      { data: categoriesData, error: categoriesError },
    ] = await Promise.all([
      applyPublicServiceFilters(supabaseAdmin.from('services').select(servicesSelect))
        .eq('products.synthetic', false)
        .order('created_at', { ascending: true }),
      applyPublicProductFilters(
        supabaseAdmin
          .from('products')
          .select('id,slug,name_ar,name_en,description_ar,description_en,base_price,currency,status,featured,verified,category_id,created_at,updated_at')
      ).order('created_at', { ascending: true }),
      applyPublicCategoryFilters(supabaseAdmin.from('product_categories').select('id,slug,name_en,name_ar')),
    ]);

    if (servicesError && productsError && categoriesError) {
      return null;
    }

    const services = (servicesData ?? []) as RawMarketplaceServiceRecord[];
    const products = (productsData ?? []) as RawMarketplaceProductRecord[];
    const categories = (categoriesData ?? []) as RawMarketplaceProductCategoryRecord[];
    const categoriesById = new Map(categories.map((category) => [category.id, category]));

    const existingServiceKeys = new Set(
      services.map((service) => String(service.slug ?? service.id ?? '')).filter((key) => key.length > 0)
    );

    const productAsServices: RawMarketplaceServiceRecord[] = products
      .filter((product) => existingServiceKeys.has(String(product.slug ?? product.id)) === false)
      .map((product) => {
        const category = product.category_id ? categoriesById.get(product.category_id) : undefined;

        return {
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
          marketplace_category: category?.slug ?? category?.name_en ?? category?.name_ar ?? null,
          category_slug: category?.slug ?? null,
          category_name_en: category?.name_en ?? null,
          category_name_ar: category?.name_ar ?? null,
          created_at: product.created_at,
          updated_at: product.updated_at,
          products: [
            {
              id: product.id,
              price_per_unit: product.base_price ?? 0,
              region: null,
            },
          ],
        };
      });

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
