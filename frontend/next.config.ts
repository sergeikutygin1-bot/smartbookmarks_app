import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for optimized Docker builds
  output: 'standalone',

  // Disable telemetry in production
  experimental: {
    instrumentationHook: false,
  },

  // Proxy API requests to backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3002/api/:path*',
      },
    ];
  },
};

export default nextConfig;
