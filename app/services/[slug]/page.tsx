import PublicServiceDetailClient from '@/components/public/PublicServiceDetailClient';

export default async function ServiceProductsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PublicServiceDetailClient slug={slug} />;
}