import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@jobautomation/config', '@jobautomation/core', '@jobautomation/db'],
  // Disable in-memory router cache: autopilot batch detail payloads (many child
  // application runs × full JobRecord) exceed the default maxSize limit, which
  // causes router.refresh() RSC updates to be silently dropped on the client.
  cacheMaxMemorySize: 0
};

export default nextConfig;
