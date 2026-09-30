import type { NextConfig } from "next";

// HSTS only makes sense when the app is actually served over HTTPS. On the
// plain-HTTP LAN deployment it is ignored at best and harmful at worst.
const isHttpsDeployment = (process.env.APP_PUBLIC_URL ?? "").startsWith("https://");

const securityHeaders = [
  // Content-Security-Policy is emitted per request (with a script nonce) by
  // src/proxy.ts, not here.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isHttpsDeployment
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Verification builds can target another directory (e.g. NEXT_DIST_DIR=.next-verify)
  // so a build never overwrites the `.next` the production service is serving.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Standalone build disabled on this native Windows host.
  // Turbopack production + Prisma WASM compiler leaves `[externals]_node:*`
  // chunks unresolved in standalone mode (see 2026-05-25 incident). We use
  // `npx next start` against the regular `.next/` output instead, built with
  // `next build --webpack` to keep externals handled correctly.
  // output: "standalone",
  outputFileTracingIncludes: {
    "/api/projects/**": [
      "workers/**",
      "node_modules/pdf-parse/**",
      "node_modules/mammoth/**",
      "node_modules/exceljs/**",
      "node_modules/pptx-text-parser/**",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
