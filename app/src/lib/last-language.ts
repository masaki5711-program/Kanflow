import { languageLabels, type Language } from "./i18n"

/**
 * "Last used UI language" for pages rendered before sign-in (the login page).
 * Signed-in pages use the language saved on the user; this cookie only
 * remembers it for the next visit, and Accept-Language is the fallback for a
 * browser that has never signed in.
 */
export const LAST_LANGUAGE_COOKIE = "kanflow_lang"
/** One year, in seconds. */
const LAST_LANGUAGE_MAX_AGE = 60 * 60 * 24 * 365
export const DEFAULT_LANGUAGE: Language = "ja"

const SUPPORTED = Object.keys(languageLabels) as Language[]

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED as string[]).includes(value)
}

/**
 * Best supported language of an Accept-Language header ("id-ID,id;q=0.9,en;q=0.8"),
 * honouring q-values; region subtags are ignored. null when none is supported.
 */
export function parseAcceptLanguage(header: string | null | undefined): Language | null {
  if (!header) return null
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";")
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="))
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1
      return { base: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0, index }
    })
    .filter((r) => r.q > 0 && isLanguage(r.base))
    .sort((a, b) => b.q - a.q || a.index - b.index)
  return ranked.length > 0 ? (ranked[0].base as Language) : null
}

/** Language for a visitor without a session: last-used cookie → Accept-Language → ja. */
export function resolveAnonymousLanguage(cookieValue: string | null | undefined, acceptLanguage: string | null | undefined): Language {
  if (isLanguage(cookieValue)) return cookieValue
  return parseAcceptLanguage(acceptLanguage) ?? DEFAULT_LANGUAGE
}

/**
 * Language the login page should save to the profile after signing in:
 * only an explicit choice on the login page, never the untouched default
 * (which would overwrite the user's saved preference).
 */
export function loginLanguageToPersist(selected: Language, touched: boolean): Language | null {
  return touched ? selected : null
}

export function lastLanguageCookie(language: Language): string {
  return `${LAST_LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=${LAST_LANGUAGE_MAX_AGE}; SameSite=Lax`
}

/** Remember the language for the next login page (browser only; no-op on the server). */
export function rememberLastLanguage(language: Language): void {
  if (typeof document === "undefined" || !isLanguage(language)) return
  document.cookie = lastLanguageCookie(language)
}
