import { supabaseAdmin } from '@/lib/supabase/server';
import { applyPublicAssetSyntheticFilter, applyPublicCategoryFilters, applyPublicProductFilters, applyPublicServiceFilters } from '@/lib/marketplace/public-filters';
import type { MarketplaceEnvironment, MarketplaceFulfilmentState, MarketplaceSupplyType, MarketplaceTransactionMethod } from '@/lib/marketplace/truth';

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
  marketplace_family?: 'drive' | 'stay' | 'fly' | 'concierge' | 'vip' | null;
  category_slug?: string | null;
  category_name_en?: string | null;
  category_name_ar?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  fulfilment_state?: MarketplaceFulfilmentState | null;
  transaction_method?: MarketplaceTransactionMethod | null;
  marketplace_environment?: MarketplaceEnvironment | null;
  supply_type?: MarketplaceSupplyType | null;
  supplier_name?: string | null;
  supplier_verified?: boolean | null;
  primary_image_url?: string | null;
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
  marketplace_family?: 'drive' | 'stay' | 'fly' | 'concierge' | 'vip' | null;
  created_at?: string | null;
  updated_at?: string | null;
  fulfilment_state?: MarketplaceFulfilmentState | null;
  transaction_method?: MarketplaceTransactionMethod | null;
  marketplace_environment?: MarketplaceEnvironment | null;
  supply_type?: MarketplaceSupplyType | null;
  supplier_name?: string | null;
  supplier_verified?: boolean | null;
};

type RawMarketplaceProductImageRecord = {
  product_id: string;
  image_url?: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
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
      { error: servicesError },
      { data: productsData, error: productsError },
      { data: categoriesData, error: categoriesError },
    ] = await Promise.all([
      applyPublicServiceFilters(supabaseAdmin.from('services').select(servicesSelect))
        .eq('products.synthetic', false)
        .order('created_at', { ascending: true }),
      applyPublicProductFilters(
        supabaseAdmin
          .from('products')
          .select('id,slug,name_ar,name_en,description_ar,description_en,base_price,currency,status,featured,verified,category_id,marketplace_family,created_at,updated_at,fulfilment_state,transaction_method,marketplace_environment,supply_type,supplier_name,supplier_verified')
      ).order('created_at', { ascending: true }),
      applyPublicCategoryFilters(supabaseAdmin.from('product_categories').select('id,slug,name_en,name_ar')),
    ]);

    if (servicesError && productsError && categoriesError) {
      return null;
    }

    const products = (productsData ?? []) as RawMarketplaceProductRecord[];
    const categories = (categoriesData ?? []) as RawMarketplaceProductCategoryRecord[];
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    const productIds = products.map((product) => product.id);
    const imageResult = productIds.length
      ? await applyPublicAssetSyntheticFilter(
          supabaseAdmin
            .from('product_images')
            .select('product_id,image_url,is_primary,sort_order')
            .in('product_id', productIds)
        ).order('sort_order', { ascending: true })
      : { data: [], error: null };
    const images = (imageResult.data ?? []) as RawMarketplaceProductImageRecord[];
    const firstImageByProduct = new Map<string, RawMarketplaceProductImageRecord>();

    for (const image of images) {
      const current = firstImageByProduct.get(image.product_id);
      if (!current || image.is_primary === true) {
        firstImageByProduct.set(image.product_id, image);
      }
    }

    const signedImageByProduct = new Map<string, string>();
    await Promise.all(Array.from(firstImageByProduct.entries()).map(async ([productId, image]) => {
      if (!image.image_url) return;
      if (/^https?:\/\//i.test(image.image_url)) {
        signedImageByProduct.set(productId, image.image_url);
        return;
      }
      const { data } = await supabaseAdmin!.storage.from('partner-media').createSignedUrl(image.image_url, 300);
      if (data?.signedUrl) signedImageByProduct.set(productId, data.signedUrl);
    }));

    const productAsServices: RawMarketplaceServiceRecord[] = products
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
          marketplace_family: product.marketplace_family,
          category_slug: category?.slug ?? null,
          category_name_en: category?.name_en ?? null,
          category_name_ar: category?.name_ar ?? null,
          created_at: product.created_at,
          updated_at: product.updated_at,
          fulfilment_state: product.fulfilment_state,
          transaction_method: product.transaction_method,
          marketplace_environment: product.marketplace_environment,
          supply_type: product.supply_type,
          supplier_name: product.supplier_name,
          supplier_verified: product.supplier_verified,
          primary_image_url: signedImageByProduct.get(product.id) ?? null,
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
      services: productAsServices,
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
