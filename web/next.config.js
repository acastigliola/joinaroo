/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // /site when served to phones through the Expo tunnel (see mobile/metro.config.js).
  // Leave NEXT_BASE_PATH unset for a normal root deployment.
  basePath: process.env.NEXT_BASE_PATH || undefined,
};

module.exports = nextConfig;
