import path from "node:path";
import type { NextConfig } from "next";

// The store lives inside the Rassah repository but is a separate app. Pin the project root to this
// folder so Next.js never picks up Rassah's files (e.g. its proxy.ts or lockfile).
const root = path.resolve(process.cwd());

// Kept deliberately simple (no Cache Components): every page and API route reads live data.
const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
