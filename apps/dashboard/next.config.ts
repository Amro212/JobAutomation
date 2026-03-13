import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@jobautomation/config', '@jobautomation/core', '@jobautomation/db']
};

export default nextConfig;
