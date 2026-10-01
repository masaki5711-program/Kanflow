import type { Language, Translations } from "@/lib/i18n"
import { projectRoleShortLabel } from "@/lib/project-roles"
import type { Project } from "./types"

/** Section keys of the "by my role" grouping (also the persisted collapse keys, prefixed "role-"). */
export type RoleGroupKey = "favorites" | "po" | "sm" | "member" | "viewer"

export interface RoleGroup {
  key: RoleGroupKey
  items: Project[]
}

const ROLE_ORDER: readonly RoleGroupKey[] = ["po", "sm", "member", "viewer"]

/** Which role section a project belongs to, from the viewer's own project role. */
export function roleGroupOf(p: Project): Exclude<RoleGroupKey, "favorites"> {
  if (p.myRole === "po") return "po"
  if (p.myRole === "sm") return "sm"
  if (p.myRole === "dev") return "member"
  // Not a member: visible through a section (section manager) or as admin.
  return "viewer"
}

/**
 * Group the (already filtered and sorted) projects by the viewer's role.
 * Favorites get their own section on top and are not repeated below; empty
 * sections are dropped. Order inside a section keeps the input order.
 */
export function groupByRole(projects: readonly Project[], isFav: (p: Project) => boolean): RoleGroup[] {
  const favorites = projects.filter(isFav)
  const rest = projects.filter((p) => !isFav(p))
  const groups: RoleGroup[] = [
    { key: "favorites", items: favorites },
    ...ROLE_ORDER.map((key) => ({ key, items: rest.filter((p) => roleGroupOf(p) === key) })),
  ]
  return groups.filter((g) => g.items.length > 0)
}

function fill(template: string, role: string): string {
  return template.replaceAll("{role}", role)
}

/**
 * Section title. PO / SM use the Scrum short role names of lib/project-roles
 * ("PO のプロジェクト"); members and view-only get their own wording.
 */
export function roleGroupTitle(key: RoleGroupKey, t: Translations, language: Language): string {
  switch (key) {
    case "favorites":
      return t.projectGroupFavorites
    case "po":
      return fill(t.projectGroupRoleOwn, projectRoleShortLabel("po", language))
    case "sm":
      return fill(t.projectGroupRoleOwn, projectRoleShortLabel("sm", language))
    case "member":
      return t.projectGroupRoleMember
    case "viewer":
      return t.projectGroupRoleViewer
  }
}
