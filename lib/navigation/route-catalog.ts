import type { TeamPermission } from '@/lib/auth/team-access';

export type RouteAudience = 'public' | 'auth' | 'customer' | 'partner' | 'admin' | 'staff-country' | 'ceo' | 'internal' | 'legacy';
export type RouteDiscoverability = 'direct' | 'hub' | 'contextual' | 'redirect' | 'internal';

export type RouteCatalogEntry = {
  path: string;
  audience: RouteAudience;
  protected: boolean;
  discoverability: RouteDiscoverability;
  parent?: string;
  indexable?: boolean;
};

export const routeCatalog: readonly RouteCatalogEntry[] = [
  { path: '/', audience: 'public', protected: false, discoverability: 'direct', indexable: true },
  { path: '/about', audience: 'public', protected: false, discoverability: 'direct', indexable: true },
  { path: '/contact', audience: 'public', protected: false, discoverability: 'direct', indexable: true },
  { path: '/services', audience: 'public', protected: false, discoverability: 'direct', indexable: true },
  ...['drive', 'stay', 'fly', 'concierge', 'vip'].map((slug) => ({ path: `/services/${slug}`, audience: 'public' as const, protected: false, discoverability: 'hub' as const, parent: '/services', indexable: true })),
  { path: '/marketplace', audience: 'public', protected: false, discoverability: 'direct', indexable: true },
  { path: '/marketplace/preview', audience: 'public', protected: false, discoverability: 'contextual', parent: '/marketplace' },
  { path: '/dabra', audience: 'public', protected: false, discoverability: 'direct', indexable: true },
  { path: '/terms', audience: 'public', protected: false, discoverability: 'direct', indexable: true },
  { path: '/privacy', audience: 'public', protected: false, discoverability: 'direct', indexable: true },
  { path: '/support', audience: 'public', protected: false, discoverability: 'direct', indexable: true },
  { path: '/apartments', audience: 'public', protected: false, discoverability: 'hub', parent: '/about', indexable: true },
  { path: '/experiences', audience: 'public', protected: false, discoverability: 'hub', parent: '/about', indexable: true },
  { path: '/offers', audience: 'public', protected: false, discoverability: 'hub', parent: '/about', indexable: true },

  ...['/login', '/register', '/auth/signin', '/auth/verify-email', '/auth/forgot-password', '/auth/reset-password', '/login-success'].map((path) => ({ path, audience: 'auth' as const, protected: false, discoverability: path === '/login' || path === '/register' ? 'direct' as const : 'contextual' as const })),

  ...['/my-account', '/my-bookings', '/my-wallet', '/my-documents', '/favorites', '/my-profile', '/support'].map((path) => ({ path, audience: 'customer' as const, protected: path !== '/support', discoverability: 'direct' as const })),
  { path: '/booking', audience: 'customer', protected: true, discoverability: 'contextual', parent: '/marketplace' },
  { path: '/my-requests/[reference]', audience: 'customer', protected: true, discoverability: 'contextual', parent: '/my-account' },
  { path: '/my-bookings/[id]', audience: 'customer', protected: true, discoverability: 'contextual', parent: '/my-bookings' },
  { path: '/my-bookings/[id]/review', audience: 'customer', protected: true, discoverability: 'contextual', parent: '/my-bookings/[id]' },

  { path: '/partner-portal', audience: 'partner', protected: true, discoverability: 'direct' },
  { path: '/partner-portal/requests', audience: 'partner', protected: true, discoverability: 'direct', parent: '/partner-portal' },
  { path: '/provider-portal', audience: 'partner', protected: true, discoverability: 'contextual', parent: '/partner-portal' },

  { path: '/admin', audience: 'admin', protected: true, discoverability: 'direct' },
  ...['dashboard', 'bookings', 'categories', 'pricing', 'partners', 'customers', 'products', 'assignment', 'finance', 'operations', 'verification', 'audit', 'events', 'notifications', 'shield'].map((slug) => ({ path: `/admin/${slug}`, audience: 'admin' as const, protected: true, discoverability: 'direct' as const, parent: '/admin' })),
  { path: '/admin/team', audience: 'ceo', protected: true, discoverability: 'direct', parent: '/admin' },
  { path: '/admin/partners/vip-local-egypt', audience: 'admin', protected: true, discoverability: 'direct', parent: '/admin/partners' },
  ...['/admin/assignment/logs', '/admin/assignment/rules', '/admin/verification/customers', '/admin/verification/documents', '/admin/verification/partners', '/admin/partners/new', '/admin/bookings/[id]', '/admin/customers/[id]', '/admin/partners/[id]', '/admin/products/[id]', '/admin/products/[id]/preview'].map((path) => ({ path, audience: 'admin' as const, protected: true, discoverability: 'contextual' as const, parent: path.split('/').slice(0, 3).join('/') })),

  { path: '/ai/pilot', audience: 'internal', protected: true, discoverability: 'internal' },
  { path: '/dashboard', audience: 'legacy', protected: true, discoverability: 'redirect', parent: '/admin' },
  { path: '/profile', audience: 'legacy', protected: true, discoverability: 'redirect', parent: '/my-profile' },
] as const;

export const publicSitemapPaths = [...new Set(routeCatalog
  .filter((entry) => entry.audience === 'public' && entry.indexable && !entry.protected)
  .map((entry) => entry.path))];

export const customerNavigationItems = [
  { href: '/my-account', ar: 'لوحة الحساب', en: 'My account' },
  { href: '/my-bookings', ar: 'حجوزاتي', en: 'My bookings' },
  { href: '/my-wallet', ar: 'محفظة السفر', en: 'Travel wallet' },
  { href: '/my-documents', ar: 'مستنداتي', en: 'My documents' },
  { href: '/favorites', ar: 'المفضلة', en: 'Favorites' },
  { href: '/my-profile', ar: 'إعدادات الحساب', en: 'Account settings' },
  { href: '/support', ar: 'المساعدة والدعم', en: 'Help and support' },
] as const;

export const partnerNavigationItems = [
  { href: '/partner-portal', ar: 'بوابة الشريك', en: 'Partner portal' },
  { href: '/partner-portal/requests', ar: 'الطلبات', en: 'Requests' },
] as const;

export type ProtectedNavigationItem = {
  href: string;
  key: 'dashboard' | 'executive' | 'bookings' | 'categories' | 'pricing' | 'partners' | 'customers' | 'products' | 'assignment' | 'finance' | 'operations' | 'verification' | 'audit' | 'events' | 'notifications' | 'shield' | 'vipEgypt';
  globalOnly?: boolean;
  permission?: TeamPermission;
};

export const protectedNavigationItems: readonly ProtectedNavigationItem[] = [
  { href: '/admin', key: 'dashboard', globalOnly: true },
  { href: '/admin/dashboard', key: 'executive', globalOnly: true },
  { href: '/admin/bookings', key: 'bookings', globalOnly: true },
  { href: '/admin/categories', key: 'categories', globalOnly: true },
  { href: '/admin/pricing', key: 'pricing', globalOnly: true },
  { href: '/admin/partners', key: 'partners', permission: 'partners:read' },
  { href: '/admin/customers', key: 'customers', permission: 'customers:read' },
  { href: '/admin/products', key: 'products', permission: 'products:read' },
  { href: '/admin/assignment', key: 'assignment', globalOnly: true },
  { href: '/admin/finance', key: 'finance', globalOnly: true },
  { href: '/admin/operations', key: 'operations', globalOnly: true },
  { href: '/admin/verification', key: 'verification', globalOnly: true },
  { href: '/admin/audit', key: 'audit', globalOnly: true },
  { href: '/admin/events', key: 'events', globalOnly: true },
  { href: '/admin/notifications', key: 'notifications', globalOnly: true },
  { href: '/admin/shield', key: 'shield', globalOnly: true },
  { href: '/admin/partners/vip-local-egypt', key: 'vipEgypt', globalOnly: true },
];

export function visibleProtectedNavigation(isGlobal: boolean, permissions: readonly string[]) {
  return protectedNavigationItems.filter((item) => {
    if (isGlobal) return true;
    if (item.globalOnly) return false;
    return Boolean(item.permission && (permissions.includes('admin:full') || permissions.includes(item.permission)));
  });
}
