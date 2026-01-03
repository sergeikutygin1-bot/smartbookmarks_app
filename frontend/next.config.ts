import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for optimized Docker builds
  output: 'standalone',

  // Disable telemetry in production
  experimental: {
    instrumentationHook: false,
  },
};

export default nextConfig;
