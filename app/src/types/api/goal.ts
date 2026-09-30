import type { EntityI18n } from "@/lib/translation/types"

/** Product goal (GET /api/projects/:id/goals, embedded in the project detail). */
export interface ProductGoalDto {
  id: string
  title: string
  description: string | null
  i18n?: EntityI18n
}
