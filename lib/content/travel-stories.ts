export type TravelStoryService = 'drive' | 'stay' | 'fly' | 'concierge' | 'vip';

export type TravelStory = {
  id: string;
  service: TravelStoryService;
  type: 'event' | 'destination' | 'video' | 'story';
  title: string;
  thumbnail: string;
  mediaUrl: string;
  duration: number;
  destination: string;
  featured: boolean;
  sortOrder: number;
  published: boolean;
  source: string;
  sourceType: 'official-website' | 'official-youtube';
  country: 'SA' | 'AE' | 'EG' | 'QA' | 'BH' | 'KW' | 'JO' | 'SY';
  cityOrRegion: string;
  publishedOrEventDate: string | null;
  image: string;
  videoUrl: string | null;
  destinationUrl: string;
};

// No approved story records are currently available in the repository.
export const travelStories: readonly TravelStory[] = [];
