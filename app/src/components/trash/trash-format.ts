import type { Language, Translations } from "@/lib/i18n"

/** Wire shapes of the trash APIs (see src/services/trash/trash.service.ts). */
export interface TrashUserRef {
  id: string
  name: string | null
}

const LOCALE: Record<Language, string> = { ja: "ja-JP", en: "en-US", id: "id-ID" }

/** Date + time in the UI language, e.g. "2026/10/01 09:30". Invalid input → "". */
export function formatTrashDate(iso: string, language: Language, withTime = true): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(LOCALE[language] ?? LOCALE.ja, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
}

/** "削除した人: Alice" / unknown user fallback. */
export function deletedByLabel(t: Pick<Translations, "trashDeletedBy" | "trashUnknownUser">, who: TrashUserRef | null): string {
  return t.trashDeletedBy.replace("{name}", who?.name ?? t.trashUnknownUser)
}
