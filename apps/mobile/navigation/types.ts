export type RouteTabKey = 'home' | 'signIn' | 'marketplace' | 'myBookings' | 'account';

export type RouteKey = RouteTabKey | 'bookingDetail' | 'marketplaceCategory' | 'marketplaceItem' | 'bookingIntent';

export type RouteDestination =
  | { key: 'home' }
  | { key: 'signIn' }
  | { key: 'marketplace' }
  | { key: 'marketplaceCategory'; categorySlug: string }
  | { key: 'marketplaceItem'; itemSlug: string }
  | { key: 'bookingIntent'; itemSlug: string }
  | { key: 'myBookings' }
  | { key: 'account' }
  | { key: 'bookingDetail'; bookingId: string };

export type RouteDefinition = {
  key: RouteTabKey;
  labelEn: string;
  labelAr: string;
};
