/**
 * PBI keys in Git text (pure). A merge request title, branch name or commit
 * message refers to a PBI with its number: "PBI-123", "pbi_123", "PBI 123" or
 * "PBI123" (case-insensitive), e.g. branch feature/PBI-123-login-form.
 */
const KEY_RE = /(?<![a-z0-9])pbi[-_ ]?(\d{1,7})(?![0-9])/gi

/** Distinct PBI numbers mentioned in the texts, in first-seen order. */
export function extractPbiNumbers(...texts: Array<string | null | undefined>): number[] {
  const seen = new Set<number>()
  for (const text of texts) {
    if (!text) continue
    for (const m of text.matchAll(KEY_RE)) {
      const n = Number(m[1])
      if (n > 0) seen.add(n)
    }
  }
  return [...seen]
}

export function pbiKey(displayId: number): string {
  return `PBI-${displayId}`
}

/**
 * Suggested branch name: feature/PBI-123-<slug of the title>. Non-ASCII titles
 * (Japanese) give no slug, so the name is just feature/PBI-123.
 */
export function suggestBranchName(displayId: number, title: string | null | undefined): string {
  const slug = (title ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 6)
    .join("-")
    .slice(0, 40)
    .replace(/-+$/, "")
  return slug ? `feature/${pbiKey(displayId)}-${slug}` : `feature/${pbiKey(displayId)}`
}
