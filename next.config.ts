import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships native modules + WASM; keep it out of the server bundle so
  // Next loads it via require() at runtime instead of bundling it.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
