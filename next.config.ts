import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
