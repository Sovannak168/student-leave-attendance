/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for lean Docker images
  output: 'standalone',

  // Disable strict mode for Socket.IO compatibility (avoids double-connect in dev)
  reactStrictMode: false,

  // Webpack config to prevent leaflet from being bundled server-side
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'leaflet'];
    }
    return config;
  },
};

module.exports = nextConfig;
