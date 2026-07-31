'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createMarketplaceFallbackServices,
  normalizeMarketplaceServices,
  type MarketplaceCollectionKey,
  type MarketplaceFamilyKey,
  type MarketplacePageCategory,
  type MarketplaceService,
  type MarketplaceSortKey,
} from '@/lib/marketplace/data';

type MarketplaceServicesQuery = {
  family?: MarketplaceFamilyKey;
  category?: MarketplacePageCategory;
  query?: string;
  collection?: MarketplaceCollectionKey;
  sort?: MarketplaceSortKey;
  destination?: string;
  budget?: string;
  travelers?: string;
  availability?: 'all' | 'available' | 'limited' | 'sold-out';
  page?: number;
  pageSize?: number;
};

type MarketplaceServicesMeta = {
  source: 'supabase' | 'api' | 'fallback';
  hasRealData: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  generatedAt: string;
  facets: {
    categories: Array<{ category: string; label: string; count: number }>;
    collections: Record<'all' | 'featured' | 'popular' | 'recommended', number>;
  };
};

const fallbackMeta: MarketplaceServicesMeta = {
  source: 'fallback',
  hasRealData: false,
  total: 0,
  page: 1,
  pageSize: 9,
  totalPages: 1,
  generatedAt: new Date(0).toISOString(),
  facets: {
    categories: [],
    collections: {
      all: 0,
      featured: 0,
      popular: 0,
      recommended: 0,
    },
  },
};

function parsePayload(data: unknown): { services: MarketplaceService[]; meta: MarketplaceServicesMeta } {
  if (Array.isArray(data)) {
    const services = normalizeMarketplaceServices(data);
    return {
      services,
      meta: {
        ...fallbackMeta,
        total: services.length,
        facets: {
          categories: [],
          collections: {
            all: services.length,
            featured: services.filter((service) => service.featured).length,
            popular: services.filter((service) => service.popular).length,
            recommended: services.filter((service) => service.recommended).length,
          },
        },
      },
    };
  }

  const payload = data as { services?: unknown; meta?: Partial<MarketplaceServicesMeta> };
  const services = Array.isArray(payload.services) ? (payload.services as MarketplaceService[]) : createMarketplaceFallbackServices();

  return {
    services,
    meta: {
      ...fallbackMeta,
      ...payload.meta,
      facets: {
        ...fallbackMeta.facets,
        ...(payload.meta?.facets ?? {}),
        collections: {
          ...fallbackMeta.facets.collections,
          ...(payload.meta?.facets?.collections ?? {}),
        },
      },
      total: payload.meta?.total ?? services.length,
    },
  };
}

export function useMarketplaceServices(options: MarketplaceServicesQuery = {}) {
  const [services, setServices] = useState<MarketplaceService[]>(() => createMarketplaceFallbackServices());
  const [meta, setMeta] = useState<MarketplaceServicesMeta>(fallbackMeta);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestQuery = useMemo(() => {
    const params = new URLSearchParams();

    Object.entries(options).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '' || value === 'all') {
        return;
      }

      params.set(key, String(value));
    });

    return params.toString();
  }, [options]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadServices() {
      setLoading(true);

      try {
        const response = await fetch(`/api/services${requestQuery ? `?${requestQuery}` : ''}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('تعذر تحميل الخدمات حالياً');
        }

        const data = (await response.json()) as unknown;

        if (!active) {
          return;
        }

        const parsed = parsePayload(data);
        setServices(parsed.services);
        setMeta(parsed.meta);
        setError(null);
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') {
          return;
        }

        if (!active) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : 'تعذر تحميل الخدمات حالياً');
        const fallbackServices = createMarketplaceFallbackServices();
        setServices(fallbackServices);
        setMeta({
          ...fallbackMeta,
          total: fallbackServices.length,
          facets: {
            ...fallbackMeta.facets,
            collections: {
              all: fallbackServices.length,
              featured: fallbackServices.filter((service) => service.featured).length,
              popular: fallbackServices.filter((service) => service.popular).length,
              recommended: fallbackServices.filter((service) => service.recommended).length,
            },
          },
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadServices();

    return () => {
      active = false;
      controller.abort();
    };
  }, [requestQuery]);

  return { services, loading, error, meta };
}