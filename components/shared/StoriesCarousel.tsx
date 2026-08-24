'use client';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { TravelStory, TravelStoryService } from '@/lib/content/travel-stories';

type StoriesCarouselProps = {
  stories: readonly TravelStory[];
  service?: TravelStoryService;
};

export default function StoriesCarousel({ stories, service }: StoriesCarouselProps) {
  const { language, direction } = useLanguage();
  const visibleStories = stories
    .filter((story) => {
      const arabicTitle = /[\u0600-\u06FF]/.test(story.title);
      return story.published && (!service || story.service === service) && (language === 'ar' ? arabicTitle : !arabicTitle);
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (!visibleStories.length) return null;

  const tickerStories = [...visibleStories, ...visibleStories];

  return (
    <section dir={direction} aria-label={language === 'ar' ? 'تجارب المسافرين' : 'Travel stories'} className="home-stories-section px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto mb-4 max-w-7xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--home-gold)]">{language === 'ar' ? 'تجارب المسافرين' : 'Travel stories'}</p>
      </div>
      <div className="home-stories-track mx-auto max-w-7xl flex gap-4 overflow-x-auto pb-2">
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
    </section>
  );
}
