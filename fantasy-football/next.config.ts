import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep server-only packages out of any client bundle.
  serverExternalPackages: ['@prisma/client', '@anthropic-ai/sdk'],

  // Emit a self-contained server bundle so the container image does not need to ship
  // node_modules. Vercel ignores this; Docker/Fly/Railway/self-hosting rely on it.
  output: 'standalone',
};

export default nextConfig;
