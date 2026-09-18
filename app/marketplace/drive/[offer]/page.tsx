import { notFound } from 'next/navigation';
import DriveDeal from '@/components/drive/DriveDeal';
import { driveOffer } from '@/lib/drive/catalog';
import { serializePageQuery } from '@/lib/marketplace/search-context';
export default async function DriveDealPage({ params, searchParams }: { params: Promise<{ offer: string }>; searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const { offer }=await params; if(!driveOffer(offer))notFound();
  return <DriveDeal offerId={offer} initialSearch={serializePageQuery(await searchParams)}/>;
}
