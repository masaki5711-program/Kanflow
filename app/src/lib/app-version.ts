/**
 * Which Kanflow is running, for the header badge and the login page.
 *
 * APP_GENERATION names the product line: "Ver2" is the PostgreSQL line that replaced v1 (MySQL) on
 * 2026-11-05. The exact version is stamped at build time by next.config.ts into NEXT_PUBLIC_APP_VERSION
 * (`git describe --tags`, e.g. "v2-prod-20261105"); a build outside git shows "dev".
 */
export const APP_GENERATION = "Ver2"

const SAFE_VERSION = /^[0-9A-Za-z._+-]{1,64}$/

/** The build's version string, or "dev" when it is missing or not a plain version token. */
export function appVersion(raw: string | undefined = process.env.NEXT_PUBLIC_APP_VERSION): string {
  const v = (raw ?? "").trim()
  return SAFE_VERSION.test(v) ? v : "dev"
}
