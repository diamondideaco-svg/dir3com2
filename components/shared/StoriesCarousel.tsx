'use client';
import type { TravelStory, TravelStoryService } from '@/lib/content/travel-stories';

type StoriesCarouselProps = {
  stories: readonly TravelStory[];
  service?: TravelStoryService;
};

export default function StoriesCarousel({ stories, service }: StoriesCarouselProps) {
  const visibleStories = stories
    .filter((story) => story.published && (!service || story.service === service))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (!visibleStories.length) return null;

  const tickerStories = [...visibleStories, ...visibleStories];

  return (
    <section aria-label="Travel stories" className="home-stories-section px-4 py-10 sm:px-6 lg:px-10">
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
