import type { MetadataRoute } from 'next';
import { publicSitemapPaths } from '@/lib/navigation/route-catalog';

/** Public discovery only; no private, transactional or synthetic URLs. */
export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemapPaths
    .map(path => ({ url: `https://dir3com.com${path}` }));
}
