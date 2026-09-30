import type { EntityI18n } from "@/lib/translation/types"

/** One task of a fixed-task template group (GET /api/user/fixed-tasks). */
export interface FixedTaskItemDto {
  id: string
  taskName: string
  sortOrder: number
  i18n?: EntityI18n
}

/** Fixed-task template group with its tasks (GET /api/user/fixed-tasks). */
export interface FixedTaskGroupDto {
  id: string
  taskName: string
  sortOrder: number
  items: FixedTaskItemDto[]
  i18n?: EntityI18n
}
