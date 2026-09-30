import type { SectionRefDto } from "./section"

/**
 * Subset of GET /api/projects/:id that client pages read. Every field is
 * optional because callers only rely on the parts they render.
 */
export interface ProjectDetailDto {
  id?: string
  name?: string
  defaultCapacity?: number | null
  sprintDurationDays?: number | null
  pointUnit?: string | null
  pointDescription?: string | null
  /** Flattened sections (older responses nested them as `{ section }`). */
  sections?: Array<Partial<SectionRefDto> & { section?: SectionRefDto }>
}
