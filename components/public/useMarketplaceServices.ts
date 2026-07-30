'use client';

import { useEffect, useState } from 'react';
import { normalizeMarketplaceServices, type MarketplaceService } from '@/lib/marketplace/data';

export function useMarketplaceServices() {
  const [services, setServices] = useState<MarketplaceService[]>(() => normalizeMarketplaceServices([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadServices() {
      try {
        const response = await fetch('/api/services', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('تعذر تحميل الخدمات حالياً');
        }

        const data = await response.json();

        if (!active) {
          return;
        }

        setServices(normalizeMarketplaceServices(data));
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : 'تعذر تحميل الخدمات حالياً');
        setServices(normalizeMarketplaceServices([]));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadServices();

    return () => {
      active = false;
    };
  }, []);

  return { services, loading, error };
}