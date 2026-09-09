import type { MetadataRoute } from 'next';
import { canonicalServices } from '@/lib/services/canonical';

/** Public discovery only; no private, transactional or synthetic URLs. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/services', ...canonicalServices.map(service => `/services/${service.slug}`)]
    .map(path => ({ url: `https://dir3com.com${path}` }));
}
