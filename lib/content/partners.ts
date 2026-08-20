export type PartnerScope = 'global' | 'drive' | 'stay' | 'fly' | 'concierge' | 'vip';

export type Partner = {
  id: string;
  scope: PartnerScope;
  name: string;
  logo?: string;
  href?: string;
  published: boolean;
};

export const partners: readonly Partner[] = [
  { id: 'booking', scope: 'global', name: 'Booking.com', logo: '', href: 'https://www.booking.com/', published: true },
  { id: 'getyourguide', scope: 'global', name: 'GetYourGuide', logo: '', href: 'https://www.getyourguide.com/', published: true },
  { id: 'expedia', scope: 'global', name: 'Expedia', logo: '', href: 'https://www.expedia.com/', published: true },
  { id: 'travelport', scope: 'global', name: 'Travelport', logo: '', href: 'https://www.travelport.com/', published: true },
  { id: 'sabre', scope: 'global', name: 'Sabre', logo: '', href: 'https://www.sabre.com/', published: true },
  { id: 'avis', scope: 'global', name: 'Avis', logo: '', href: 'https://www.avis.com/', published: true },
  { id: 'hertz', scope: 'global', name: 'Hertz', logo: '', href: 'https://www.hertz.com/', published: true },
  { id: 'saudia', scope: 'global', name: 'Saudia', logo: '', href: 'https://www.saudia.com/', published: true },
  { id: 'emirates', scope: 'global', name: 'Emirates', logo: '', href: 'https://www.emirates.com/', published: true },
  { id: 'qatar-airways', scope: 'global', name: 'Qatar Airways', logo: '', href: 'https://www.qatarairways.com/', published: true },
  { id: 'egyptair', scope: 'global', name: 'EgyptAir', logo: '', href: 'https://www.egyptair.com/', published: true },
  { id: 'visa', scope: 'global', name: 'Visa', logo: '', href: 'https://www.visa.com/', published: true },
  { id: 'mastercard', scope: 'global', name: 'Mastercard', logo: '', href: 'https://www.mastercard.com/', published: true },
  { id: 'mada', scope: 'global', name: 'mada', logo: '', href: 'https://www.mada.com.sa/', published: true },
];
