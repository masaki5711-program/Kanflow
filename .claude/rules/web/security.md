---
# On-demand (CLAUDE.md §9): attach only when UI surfaces are touched.
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.css"
  - "**/*.scss"
  - "**/*.html"
  - "apps/dashboard/**"
---

# Web Security Rules

## Content Security Policy

Always configure a production CSP; adjust origins per project, never
cargo-cult a template unchanged:

- `default-src 'self'`; `base-uri 'self'`
- `script-src`: per-request nonce, never `'unsafe-inline'`
- `frame-src 'none'`; `object-src 'none'`
- Restrict `connect-src`, `img-src`, `font-src`, `style-src` to the origins
  actually used

## XSS Prevention

- Never inject unsanitized HTML; avoid `innerHTML` /
  `dangerouslySetInnerHTML` unless sanitized first
- Escape dynamic template values
- When user HTML is unavoidable, sanitize with a vetted local sanitizer

## Third-Party Scripts

- Load asynchronously; SRI when serving from a CDN; audit quarterly
- Prefer self-hosting critical dependencies when practical

## HTTPS and Headers

- HSTS: max-age one year, `includeSubDomains`, `preload`
- `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- Permissions-Policy: deny camera, microphone, geolocation unless required

## Forms

- CSRF protection on state-changing forms; rate limiting on submission
  endpoints; validate client and server side
- Prefer honeypots or light anti-abuse controls over heavy CAPTCHA defaults
