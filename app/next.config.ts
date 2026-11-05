import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";

// The version the header badge shows (src/lib/app-version.ts): APP_VERSION when set, else the checkout's
// `git describe --tags` (e.g. "v2-prod-20261105", or "v2-prod-20261105-3-g1a2b3c4" after later commits).
// Read once at build time; a build without git shows "dev".
function buildVersion(): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("git", ["describe", "--tags", "--always"], { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

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
  // Next 16 `next dev` would otherwise write app/AGENTS.md and app/CLAUDE.md;
  // the repository's own CLAUDE.md is the only instruction file for agents.
  agentRules: false,
  env: { NEXT_PUBLIC_APP_VERSION: buildVersion() },
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
