import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for optimized Docker builds
  output: 'standalone',

  // Disable telemetry in production
  experimental: {
    instrumentationHook: false,
  },

  // Note: We use Next.js API routes for proxying to backend
  // They handle authentication cookie forwarding properly
  // No rewrites needed - all /api/* routes are handled by Next.js API routes
};

export default nextConfig;
