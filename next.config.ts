import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships native modules + WASM; keep it out of the server bundle so
  // Next loads it via require() at runtime instead of bundling it.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Override .next/ via env so the playwright test server can run alongside
  // the dev server — Next 16's dev lockfile lives in distDir/dev/.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    return [
      {
        source: "/docs/:slug.md",
        destination: "/docs/:slug/markdown",
      },
    ];
  },
};

export default nextConfig;
