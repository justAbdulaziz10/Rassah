import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // "/" has no page of its own. A config redirect runs before rendering, so it is a real 307
  // (a redirect() thrown from app/page.tsx failed `instant` validation in dev with NEXT_REDIRECT).
  redirects() {
    return [{ source: "/", destination: "/orders", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
