import type { NextConfig } from "next";

const collaboraUrl = process.env.NEXT_PUBLIC_COLLABORA_URL ?? "http://localhost:9980";
const collaboraWs = collaboraUrl.replace(/^http/, "ws");

const nextConfig: NextConfig = {
  // Standalone build disabled on this native Windows host.
  // Turbopack production + Prisma WASM compiler leaves `[externals]_node:*`
  // chunks unresolved in standalone mode (see 2026-05-25 incident). We use
  // `npx next start` against the regular `.next/` output instead, built with
  // `next build --webpack` to keep externals handled correctly.
  // output: "standalone",
  outputFileTracingIncludes: {
    "/api/projects/**": [
      "node_modules/pdf-parse/**",
      "node_modules/mammoth/**",
      "node_modules/xlsx/**",
      "node_modules/pptx-text-parser/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${collaboraUrl}`,
              `style-src 'self' 'unsafe-inline' ${collaboraUrl}`,
              `frame-src 'self' ${collaboraUrl}`,
              `connect-src 'self' ${collaboraUrl} ${collaboraWs}`,
              `img-src 'self' data: blob: ${collaboraUrl}`,
              `font-src 'self' data: ${collaboraUrl}`,
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
