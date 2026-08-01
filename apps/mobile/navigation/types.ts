export type RouteTabKey = 'home' | 'signIn' | 'marketplace' | 'myBookings' | 'account';

export type RouteKey = RouteTabKey | 'bookingDetail';

export type RouteDestination =
  | { key: 'home' }
  | { key: 'signIn' }
  | { key: 'marketplace' }
  | { key: 'myBookings' }
  | { key: 'account' }
  | { key: 'bookingDetail'; bookingId: string };

export type RouteDefinition = {
  key: RouteTabKey;
  labelEn: string;
  labelAr: string;
};
