'use client';
import type { TravelStory, TravelStoryService } from '@/lib/content/travel-stories';
import Image from 'next/image';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { arabicTravelSources } from '@/lib/content/arabic-travel-sources';
import homeStyles from '@/components/home/home-production.module.css';

type StoriesCarouselProps = {
  stories: readonly TravelStory[];
  service?: TravelStoryService;
  homeDiscovery?: boolean;
};

export default function StoriesCarousel({ stories, service, homeDiscovery = false }: StoriesCarouselProps) {
  const { language } = useLanguage();
  if (homeDiscovery) {
    const saudiSources = arabicTravelSources.filter(source => source.enabled && source.countryCode === 'SA' && source.type === 'official-website');
    return <section className={homeStyles.discover} aria-labelledby="home-discover-title" data-home-discover>
      <h2 id="home-discover-title">{language === 'ar' ? 'استكشف المملكة' : 'Discover Saudi Arabia'}</h2>
      <div className={homeStyles.discoverContent}>
        <Image src="/brand/runtime/golden_hour_over_the_rugged_desert_canyon.png" alt="" width={1672} height={941} sizes="(max-width: 640px) 100vw, 65vw" />
        <div>{saudiSources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">
          <span>{language === 'en' && source.id === 'gea-events-ar' ? 'General Entertainment Authority' : language === 'en' && source.id === 'aishha-events-ar' ? 'Enjoy Saudi' : source.name}</span>
          <span aria-hidden="true">↗</span>
        </a>)}</div>
      </div>
    </section>;
  }
  const visibleStories = stories
    .filter((story) => story.published && (!service || story.service === service))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (!visibleStories.length) return null;

  const tickerStories = [...visibleStories, ...visibleStories];

  return (
    <section aria-label="Travel stories" className="home-stories-section px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto mb-4 max-w-7xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--home-gold)]">تجارب المسافرين</p>
      </div>
      <div className="home-stories-marquee mx-auto max-w-7xl overflow-hidden pb-2">
        <div className="home-stories-track flex w-max gap-4">
          {tickerStories.map((story, index) => (
            <article key={`${story.id}-${index}`} className="overflow-hidden rounded-2xl border border-[var(--home-gold)]/20 bg-white shadow-[0_16px_34px_rgba(88,65,31,0.06)]">
              <a href={story.mediaUrl} target="_blank" rel="noreferrer noopener">
                <img src={story.thumbnail} alt={story.title} className="h-44 w-full object-cover" />
                <div className="p-4 text-[var(--color-navy)]">
                  <h2 className="font-semibold">{story.title}</h2>
                  <p className="mt-2 text-sm text-[#5d6672]">{story.destination} · {story.duration}s</p>
                </div>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
