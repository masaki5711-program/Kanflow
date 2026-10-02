/**
 * Link entries in the dashboard attachments (e.g. a GitLab repository):
 * pure helpers shared by the API (validation) and the UI (name suggestion,
 * icon choice). Only http(s) URLs are links — never javascript:/data: etc.
 */

/** mimeType stored on a link row (no file behind it). */
export const LINK_MIME = "text/x-uri"
export const LINK_URL_MAX = 2048
export const LINK_NAME_MAX = 200

/** True for a row that is a link rather than an uploaded file. */
export function isLinkEntry(a: { mimeType: string; linkUrl?: string | null }): boolean {
  return a.mimeType === LINK_MIME || !!a.linkUrl
}

/** The URL normalised (trimmed, parsed) when it is an absolute http(s) URL, else null. */
export function normalizeLinkUrl(raw: string): string | null {
  const text = raw.trim()
  if (!text || text.length > LINK_URL_MAX) return null
  try {
    const url = new URL(text)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname) return null
    return url.toString()
  } catch {
    return null
  }
}

/** GitLab / Git hosting URL (host contains "gitlab" or the path ends in .git). */
export function isGitLink(url: string): boolean {
  try {
    const u = new URL(url)
    return /gitlab/i.test(u.hostname) || /\.git\/?$/i.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * A display name from the URL: for a repository URL the "group/repo" path
 * (GitLab's "/-/tree/…", "/-/merge_requests/…" suffix and ".git" removed),
 * else the host. "" when the URL is not valid.
 */
export function suggestLinkName(raw: string): string {
  const url = normalizeLinkUrl(raw)
  if (!url) return ""
  const u = new URL(url)
  const path = u.pathname.split("/-/")[0].replace(/\.git\/?$/i, "").replace(/^\/+|\/+$/g, "")
  const name = decodeURIComponentSafe(path)
  return (name || u.hostname).slice(0, LINK_NAME_MAX)
}

/** "host/path" without the scheme (the secondary line under a link). */
export function linkCaption(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`
  } catch {
    return url
  }
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
