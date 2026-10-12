import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/admin/server-binding',
      headers: [
        { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
        { key: 'CDN-Cache-Control', value: 'no-store' },
        { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    }];
  },
  async redirects() {
    return [
      { source: '/cars', destination: '/services/drive', permanent: true },
      { source: '/hotels', destination: '/services/stay', permanent: true },
      { source: '/airport-transfers', destination: '/services/fly', permanent: true },
      { source: '/concierge', destination: '/services/concierge', permanent: true },
    ];
  },
};

export default nextConfig;
