import type { RouteDefinition } from '@/navigation/types';

export const PUBLIC_ROUTES: RouteDefinition[] = [
  { key: 'home', labelEn: 'Home', labelAr: 'الرئيسية' },
  { key: 'marketplace', labelEn: 'Marketplace', labelAr: 'السوق' },
  { key: 'signIn', labelEn: 'Sign In', labelAr: 'تسجيل الدخول' },
];

export const AUTH_ROUTES: RouteDefinition[] = [
  { key: 'home', labelEn: 'Home', labelAr: 'الرئيسية' },
  { key: 'marketplace', labelEn: 'Marketplace', labelAr: 'السوق' },
  { key: 'myBookings', labelEn: 'My Bookings', labelAr: 'حجوزاتي' },
  { key: 'account', labelEn: 'Account', labelAr: 'الحساب' },
];
