/** App name appended to every document title. */
export const APP_TITLE = "Kanflow"

/** Separator between document-title segments. */
export const TITLE_SEPARATOR = " · "

/**
 * Build a document title "<Page> · <Project> · Kanflow" (WCAG 2.4.2).
 * Empty / whitespace-only parts are skipped; the app name is always last.
 */
export function formatDocumentTitle(parts: ReadonlyArray<string | null | undefined>): string {
  const segments = parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0 && p !== APP_TITLE)
  return [...segments, APP_TITLE].join(TITLE_SEPARATOR)
}
