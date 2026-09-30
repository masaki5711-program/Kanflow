/**
 * Wire types of GET /api/search (dependency-free: safe to import from client
 * components with `import type`).
 */
import type { EntityI18n } from "@/lib/translation/types"
import type { SearchType } from "./search.query"

export type { SearchType }

export interface SearchHitDto {
  type: SearchType
  id: string
  projectId: string
  projectName: string
  /** Both-language project name (`name` field only). */
  projectI18n: EntityI18n
  title: string
  /** Translatable field `title` came from (for pickText on the client). */
  titleField: string
  /** Both-language title (`titleField` only). */
  i18n: EntityI18n
  displayId: number | null
  /** Secondary context (the sprint of a task). */
  context: string | null
  status: string | null
  href: string
}

export interface SearchGroupDto {
  type: SearchType
  items: SearchHitDto[]
}

export interface SearchResultDto {
  query: string
  groups: SearchGroupDto[]
}
