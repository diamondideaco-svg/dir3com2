import { redirect } from 'next/navigation';
import { serviceEntryHref } from '@/lib/marketplace/public-entry';
import { serializePageQuery } from '@/lib/marketplace/search-context';

export default async function DrivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(serviceEntryHref('drive', new URLSearchParams(serializePageQuery(await searchParams))));
}
