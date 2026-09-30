import { formatDateTime, formatLongDate } from "@/lib/format-date"
import type { Language, Translations } from "@/lib/i18n"

/** Wire shapes of the trash APIs (see src/services/trash/trash.service.ts). */
export interface TrashUserRef {
  id: string
  name: string | null
}

/** Date + time in the UI language via the app-wide helpers (A3-14), e.g. "2026/10/1 09:30". Invalid input → "". */
export function formatTrashDate(iso: string, language: Language, withTime = true): string {
  return withTime ? formatDateTime(iso, language) : formatLongDate(iso, language)
}

/** "削除した人: Alice" / unknown user fallback. */
export function deletedByLabel(t: Pick<Translations, "trashDeletedBy" | "trashUnknownUser">, who: TrashUserRef | null): string {
  return t.trashDeletedBy.replace("{name}", who?.name ?? t.trashUnknownUser)
}
