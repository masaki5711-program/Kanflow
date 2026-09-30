/** Entity types that live in a project trash (projects have their own admin trash). */
export const TRASH_ENTITY_TYPES = ["backlog_item", "icebox_item"] as const
export type TrashEntityType = (typeof TRASH_ENTITY_TYPES)[number]

/** The `[entityType]` route segment, or null when it names no trash entity type. */
export function parseTrashEntityType(raw: string): TrashEntityType | null {
  return (TRASH_ENTITY_TYPES as readonly string[]).includes(raw) ? (raw as TrashEntityType) : null
}
