import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // MySQL driver for DATA_SOURCE=mysql — loaded with Node's own require
  // rather than bundled into the route handlers.
  serverExternalPackages: ['mysql2'],
};

export default nextConfig;
