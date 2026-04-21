import type { NextConfig } from "next";

const collaboraUrl = process.env.NEXT_PUBLIC_COLLABORA_URL ?? "http://localhost:9980";
const collaboraWs = collaboraUrl.replace(/^http/, "ws");

const nextConfig: NextConfig = {
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
