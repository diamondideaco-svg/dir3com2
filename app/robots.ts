import type { MetadataRoute } from 'next';

const protectedPrefixes = [
  '/admin/', '/partner-portal/', '/provider-portal/', '/my-account', '/my-bookings',
  '/my-documents', '/my-profile', '/my-wallet', '/my-requests', '/booking', '/dashboard',
  '/profile', '/login', '/register', '/login-success', '/auth/', '/api/',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: protectedPrefixes },
    sitemap: 'https://dir3com.com/sitemap.xml',
    host: 'https://dir3com.com',
  };
}
