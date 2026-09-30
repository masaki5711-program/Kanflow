import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { ApiErrorCode } from "@/services/_shared/error-codes"
import {
  accessVia,
  can,
  isSystemAdmin,
  type AccessVia,
  type ProjectAction,
  type ProjectActor,
} from "./policy"

export interface ProjectAuthSuccess {
  session: Session
  actor: ProjectActor
  via: AccessVia
}

export type ProjectAuthResult = ProjectAuthSuccess | { error: NextResponse }

/** `{ error, code }` body so the client can localize the message by `code`. */
function authErrorResponse(error: string, code: ApiErrorCode, status: number): NextResponse {
  return NextResponse.json({ error, code }, { status })
}

export function unauthorizedResponse(): NextResponse {
  return authErrorResponse("Unauthorized", "UNAUTHORIZED", 401)
}

/** Non-members get 404 so project existence is not leaked. */
export function notFoundResponse(): NextResponse {
  return authErrorResponse("Not found", "NOT_FOUND", 404)
}

export function forbiddenResponse(): NextResponse {
  return authErrorResponse("権限がありません", "FORBIDDEN", 403)
}

/**
 * Resolve the actor for (session user, project) with at most two queries.
 * System admins need no lookup.
 */
export async function loadProjectActor(
  userId: string,
  systemRole: string,
  projectId: string
): Promise<ProjectActor> {
  const base = { userId, systemRole }
  if (isSystemAdmin(base)) {
    return { ...base, projectRole: null, isSectionManagerOfProject: false }
  }

  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { role: true },
  })

  let isSectionManagerOfProject = false
  if (systemRole === "section_manager") {
    const overlap = await prisma.projectSection.findFirst({
      where: { projectId, section: { users: { some: { userId } } } },
      select: { sectionId: true },
    })
    isSectionManagerOfProject = overlap !== null
  }

  return { ...base, projectRole: member?.role ?? null, isSectionManagerOfProject }
}

/**
 * True when the project exists and is not in the trash. A trashed project is
 * "not found" for every project route, admins included; admins restore or
 * purge it through /api/admin/trash/projects (requireAdmin, not this gate).
 */
export async function isProjectLive(projectId: string): Promise<boolean> {
  const row = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } })
  return row !== null
}

/**
 * Authenticate and authorize against an arbitrary predicate.
 * 401 no session / 404 project missing or trashed, or no path into it / 403 predicate refused.
 */
export async function authorizeProject(
  projectId: string,
  allow: (actor: ProjectActor) => boolean
): Promise<ProjectAuthResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: unauthorizedResponse() }

  const [live, actor] = await Promise.all([
    isProjectLive(projectId),
    loadProjectActor(session.user.id, session.user.role ?? "member", projectId),
  ])
  const via = accessVia(actor)
  if (!live || !via) return { error: notFoundResponse() }
  if (!allow(actor)) return { error: forbiddenResponse() }

  return { session, actor, via }
}

/**
 * The route-level gate: `const gate = await requireProject(projectId, "backlog.write")`.
 * Returns `{ session, actor, via }` or `{ error }` (401 / 404 / 403).
 */
export function requireProject(projectId: string, action: ProjectAction): Promise<ProjectAuthResult> {
  return authorizeProject(projectId, (actor) => can(actor, action))
}
