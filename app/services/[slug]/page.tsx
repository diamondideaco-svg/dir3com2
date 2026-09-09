import PublicServiceDetailClient from '@/components/public/PublicServiceDetailClient';
import { readSearchContext, serializePageQuery } from '@/lib/marketplace/search-context';

export default async function ServiceProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;

  const searchContext = readSearchContext(new URLSearchParams(serializePageQuery(await searchParams)));
  return <PublicServiceDetailClient key={`${slug}:${JSON.stringify(searchContext)}`} slug={slug} searchContext={searchContext} />;
}
