import { arabicTravelSources, approvedTravelMediaHosts } from './arabic-travel-sources';
import type { TravelStory } from './travel-stories';

const REFRESH_SECONDS = 86_400;
// One deadline covers source headers, HTML body and thumbnail validation.
const SOURCE_TIMEOUT_MS = 8_000;
let staleStories: TravelStory[] = [];

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && approvedTravelMediaHosts.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractMeta(html: string, property: string) {
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'));
  return match?.[1]?.replace(/&amp;/g, '&').trim() ?? '';
}

function repairMojibake(value: string) {
  if (!/[ØÙ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return value;
  }
}

async function readSourceResponse(
  source: (typeof arabicTravelSources)[number], index: number, url: string, signal: AbortSignal,
): Promise<TravelStory | null> {
  let response: Response | undefined;
  let thumbnailResponse: Response | undefined;
  try {
    response = await fetch(url, {
      signal,
      headers: { Accept: 'text/html,application/xhtml+xml' },
      next: { revalidate: REFRESH_SECONDS },
    });
    if (signal.aborted || !response.ok) return null;
    const html = new TextDecoder('utf-8').decode(await response.arrayBuffer());
    if (signal.aborted) return null;
    const title = repairMojibake(extractMeta(html, 'og:title') || source.name).normalize('NFC');
    const thumbnail = safeUrl(extractMeta(html, 'og:image'));
    if (!thumbnail) return null;
    thumbnailResponse = await fetch(thumbnail, {
      signal,
      method: 'GET',
      headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png' },
      next: { revalidate: REFRESH_SECONDS },
    });
    if (signal.aborted || !thumbnailResponse.ok || !thumbnailResponse.headers.get('content-type')?.startsWith('image/')) return null;
    if (thumbnailResponse.body) {
      await thumbnailResponse.body.pipeTo(new WritableStream(), { signal });
    }
    if (signal.aborted) return null;

    return {
      id: `official-${source.id}`,
      service: 'drive',
      type: 'video',
      title,
      thumbnail,
      mediaUrl: url,
      duration: 0,
      destination: source.country,
      featured: index < 3,
      sortOrder: index,
      published: true,
      source: source.name,
      sourceType: source.type,
      country: source.countryCode,
      cityOrRegion: source.country,
      publishedOrEventDate: null,
      image: thumbnail,
      videoUrl: source.type === 'official-youtube' ? url : null,
      destinationUrl: url,
    };
  } catch {
    return null;
  } finally {
    for (const unused of [response, thumbnailResponse]) {
      if (unused?.body && !unused.bodyUsed) void unused.body.cancel().catch(() => {});
    }
  }
}

async function readOfficialSource(source: (typeof arabicTravelSources)[number], index: number): Promise<TravelStory | null> {
  if (source.type === 'official-youtube' && !source.feedUrl) return null;
  const url = safeUrl(source.url);
  if (!url) return null;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>(resolve => {
    timer = setTimeout(() => { resolve(null); controller.abort(); }, SOURCE_TIMEOUT_MS);
  });
  let story: TravelStory | null = null;
  try {
    // Also settle if an adapter/cache layer does not propagate cancellation.
    story = await Promise.race([readSourceResponse(source, index, url, controller.signal), deadline]);
    return story;
  } finally {
    clearTimeout(timer);
    // Rejection must stop the same-request cache branch as well as its consumer.
    if (story === null) controller.abort();
  }
}

export async function getTravelStoriesFeed() {
  const sources = arabicTravelSources.filter((source) => source.enabled);
  const settled = await Promise.all(sources.map((source, index) => readOfficialSource(source, index)));
  const fresh = settled.filter((story): story is TravelStory => Boolean(story));
  if (fresh.length) staleStories = fresh;
  return { items: staleStories, refreshSeconds: REFRESH_SECONDS, sourceCount: sources.length };
}
