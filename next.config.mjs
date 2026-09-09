/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Listing photography is served from an external placeholder host until a
    // real photo library is wired in; see lib/photos.js.
    remotePatterns: [{ protocol: 'https', hostname: 'picsum.photos' }, { protocol: 'https', hostname: 'fastly.picsum.photos' }],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
