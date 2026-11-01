import type { Db } from "@/services/_shared/db"

/**
 * Who may see and curate which lessons (W11). Pure helpers + one loader.
 *
 * Scopes: "global", "tech:<name>" (visible to everyone), "project:<id>" (members of that project).
 * Curating (confirm / retire / systemize) needs
 *   - a system admin: every lesson;
 *   - a section manager (the "Maintainer" role of the platform): global and tech lessons;
 *   - the project's PO / SM: lessons scoped to their project.
 * AI sessions (tokens) are never curators: they only read confirmed / systemized, non-confidential lessons.
 */

export interface FeedbackViewer {
  userId: string
  /** User.role. */
  systemRole: string
  /** A token limited to some projects; null = no limit. */
  projectIds?: readonly string[] | null
}

export interface ViewerAccess {
  userId: string
  admin: boolean
  /** Curates global / tech lessons (system admin or section manager). */
  curatesGlobal: boolean
  /** Project ids the viewer is a member of (admin: not enumerated, see `admin`). */
  memberProjects: ReadonlySet<string>
  /** Project ids where the viewer is PO / SM. */
  curatorProjects: ReadonlySet<string>
}

export type ParsedScope = { kind: "global" } | { kind: "tech"; name: string } | { kind: "project"; id: string }

export function parseScope(scope: string): ParsedScope {
  if (scope.startsWith("tech:")) return { kind: "tech", name: scope.slice(5) }
  if (scope.startsWith("project:")) return { kind: "project", id: scope.slice(8) }
  return { kind: "global" }
}

export const projectScope = (projectId: string) => `project:${projectId.toLowerCase()}`

export function canSeeScope(a: ViewerAccess, scope: string): boolean {
  const s = parseScope(scope)
  if (s.kind !== "project") return true
  return a.admin || a.memberProjects.has(s.id)
}

export function canCurateScope(a: ViewerAccess, scope: string): boolean {
  if (a.admin) return true
  const s = parseScope(scope)
  if (s.kind === "project") return a.curatorProjects.has(s.id)
  return a.curatesGlobal
}

/** True when the viewer curates at least one scope (shows the curator screens). */
export function curatesAnything(a: ViewerAccess): boolean {
  return a.admin || a.curatesGlobal || a.curatorProjects.size > 0
}

const MEMBERSHIP_LIMIT = 5000

export async function loadViewerAccess(db: Db, viewer: FeedbackViewer): Promise<ViewerAccess> {
  const isAdmin = viewer.systemRole === "admin"
  const restrict = viewer.projectIds ? new Set(viewer.projectIds.map((p) => p.toLowerCase())) : null
  const memberProjects = new Set<string>()
  const curatorProjects = new Set<string>()
  if (restrict && isAdmin) {
    // An admin's token limited to some projects is only an admin inside them.
    for (const id of restrict) {
      memberProjects.add(id)
      curatorProjects.add(id)
    }
  } else if (!isAdmin) {
    const rows = await db.projectMember.findMany({ where: { userId: viewer.userId }, select: { projectId: true, role: true }, take: MEMBERSHIP_LIMIT })
    for (const r of rows) {
      const id = r.projectId.toLowerCase()
      if (restrict && !restrict.has(id)) continue
      memberProjects.add(id)
      if (r.role === "po" || r.role === "sm") curatorProjects.add(id)
    }
  }
  return {
    userId: viewer.userId,
    admin: isAdmin && !restrict,
    curatesGlobal: (isAdmin || viewer.systemRole === "section_manager") && !restrict,
    memberProjects,
    curatorProjects,
  }
}
