import { NextResponse, type NextRequest } from "next/server"

/**
 * Next 16 proxy (formerly middleware): issues a per-request CSP nonce.
 *
 * Next reads the `Content-Security-Policy` request header during rendering
 * and stamps the nonce onto its own <script> tags, so framework and page
 * scripts keep working under `'strict-dynamic'` without `'unsafe-inline'`.
 * All pages are dynamically rendered (root layout calls auth()), which is
 * required for nonces to be applied.
 */

export interface CspOptions {
  nonce: string
  isDev: boolean
  collaboraOrigin: string | null
}

function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function buildContentSecurityPolicy({ nonce, isDev, collaboraOrigin }: CspOptions): string {
  const collabora = collaboraOrigin ? ` ${collaboraOrigin}` : ""
  const scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`
  return [
    "default-src 'self'",
    scriptSrc,
    // Tailwind / React inline style attributes need this.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    // Collabora Online runs in an iframe and the editor is opened by a form POST.
    `frame-src 'self'${collabora}`,
    `form-action 'self'${collabora}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
  ].join("; ")
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export function proxy(request: NextRequest) {
  const nonce = generateNonce()
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    collaboraOrigin: originOf(process.env.NEXT_PUBLIC_COLLABORA_URL),
  })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  matcher: [
    {
      // API routes (incl. /api/wopi called by Collabora, and file downloads
      // rendered inline such as PDFs) are excluded: they return data, not
      // HTML documents that need a script nonce.
      source: "/((?!api/|_next/static|_next/image|favicon\\.ico|favicon\\.svg|icon\\.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
