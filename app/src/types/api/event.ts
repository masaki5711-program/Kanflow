import type { EntityI18n } from "@/lib/translation/types"

/** One calendar event of GET /api/projects/:id/events (dates are ISO strings). */
export interface CalendarEventDto {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  color: string
  sprintId: string | null
  /** Linked sprint, when the endpoint includes it. */
  sprint?: { id: string; sprintName: string } | null
  i18n?: EntityI18n
}
