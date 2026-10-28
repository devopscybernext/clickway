import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // MySQL driver — loaded with Node's own require rather than bundled into
  // the route handlers.
  serverExternalPackages: ['mysql2'],
  // Internal dashboard: keep every response (pages, API, files) out of
  // search engines. layout.tsx adds the matching <meta name="robots">.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ];
  },
};

export default nextConfig;
