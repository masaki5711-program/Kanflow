/**
 * Project authorization policy — the single source of truth for "who may do
 * what" inside a project. Pure (no I/O) so it can be table-tested and reused
 * by route handlers, services and UI hints alike.
 *
 * See docs/authorization.md for the rendered matrix.
 */

export const SYSTEM_ROLES = ["admin", "section_manager", "member"] as const
export type SystemRole = (typeof SYSTEM_ROLES)[number]

export const PROJECT_ROLES = ["po", "sm", "dev"] as const
export type ProjectRole = (typeof PROJECT_ROLES)[number]

export interface ProjectActor {
  userId: string
  /** User.role — "admin" | "section_manager" | "member" (unknown values act as "member"). */
  systemRole: string
  /** ProjectMember.role for this project, or null when the user is not an explicit member. */
  projectRole: string | null
  /** True when the user is a section_manager of a section the project belongs to. */
  isSectionManagerOfProject: boolean
}

export const PROJECT_ACTIONS = [
  /** Read anything in the project (incl. attachments, daily scrums) and toggle own favorite. */
  "project.view",
  /** Cosmetic per-project list preference (card color). */
  "project.updateAppearance",
  /** Edit project settings (name, description, capacity, language, ...). */
  "project.update",
  /** Edit the manual progress percentage. */
  "project.updateProgress",
  /** Reassign the project's sections. */
  "project.updateSections",
  "project.delete",
  /** Add / change role of / remove project members. */
  "member.manage",
  /** Create / edit PBIs. */
  "backlog.write",
  "backlog.delete",
  "backlog.reorder",
  "goal.write",
  "plan.write",
  "release.manage",
  /**
   * 改善成果ボード floor work: record 定着確認 results, update 横展開 status,
   * add / remove before-after photos. Effect fields, stages, adding rollout
   * targets and checks stay "release.manage" (PO).
   */
  "improvement.track",
  /**
   * マイルストーン・検収ボード floor work: tick 完了条件, record チェック項目
   * results, add / work 残課題 and their photos, mark 引き渡し資料 received and
   * attach files, enter monthly 推移 values. Stages, check / document
   * definitions, 予算 and settings stay "plan.write" (PO / SM).
   */
  "milestone.track",
  /** Create / edit / delete sprints and move PBIs in and out of them. */
  "sprint.manage",
  "task.write",
  "dailyScrum.write",
  "event.write",
  /** Upload / move / delete project attachments and folders; open in the office editor. */
  "attachment.write",
  /** Create / edit / delete Icebox items and their attachments. */
  "icebox.write",
  /** Read-only AI features (chat, reports, reviews). */
  "ai.use",
  /** AI features that author backlog content (PBI field / draft generation). */
  "ai.draftPbi",
  /** See the project trash (trashed PBIs / Icebox items) and restore from it. */
  "trash.manage",
  /** Permanently delete (purge) a trashed PBI / Icebox item before the retention period ends. */
  "trash.purge",
  /** Post comments on PBIs / sprint tasks / Icebox items; edit and delete one's own. */
  "comment.write",
  /** Delete anyone's comment (moderation). */
  "comment.moderate",
  /** Change the project's AI surveillance thresholds (enable / thresholds / critical notifications). */
  "surveillance.configure",
  /** Turn the GitLab integration on / off, set the token and the repositories. */
  "git.configure",
  /** Ask for an immediate GitLab sync ("今すぐ同期"). */
  "git.sync",
  /**
   * Developer writes of an AI session (token scope dev:write only, docs/api-v1.md
   * "Development"): declare / release work on a PBI or task (作業の宣言), post a
   * progress comment, link a merge request of a registered repository to a PBI.
   */
  "dev.write",
] as const
export type ProjectAction = (typeof PROJECT_ACTIONS)[number]

/**
 * Grants per actor kind. "member" = any explicit project member (po/sm/dev or
 * an unrecognised member role). System admins are allowed everything.
 */
type Grantee = "po" | "sm" | "member" | "section_manager"

const PO: readonly Grantee[] = ["po"]
const PO_SM: readonly Grantee[] = ["po", "sm"]
const MEMBER: readonly Grantee[] = ["member"]

const POLICY: Readonly<Record<ProjectAction, readonly Grantee[]>> = {
  "project.view": ["member", "section_manager"],
  "project.updateAppearance": MEMBER,
  "project.update": PO_SM,
  "project.updateProgress": PO,
  "project.updateSections": PO,
  "project.delete": PO,
  "member.manage": PO_SM,
  "backlog.write": PO_SM,
  "backlog.delete": PO,
  "backlog.reorder": PO,
  "goal.write": PO_SM,
  "plan.write": PO_SM,
  "release.manage": PO,
  "improvement.track": MEMBER,
  "milestone.track": MEMBER,
  "sprint.manage": PO_SM,
  "task.write": MEMBER,
  "dailyScrum.write": MEMBER,
  "event.write": MEMBER,
  "attachment.write": MEMBER,
  "icebox.write": ["member", "section_manager"],
  "ai.use": MEMBER,
  "ai.draftPbi": PO_SM,
  "trash.manage": PO_SM,
  "trash.purge": PO,
  "comment.write": MEMBER,
  "comment.moderate": PO,
  "surveillance.configure": PO,
  "git.configure": PO_SM,
  "git.sync": MEMBER,
  "dev.write": MEMBER,
}

export function isSystemAdmin(actor: Pick<ProjectActor, "systemRole">): boolean {
  return actor.systemRole === "admin"
}

/** True when the actor has any path into the project (admin, member, or section manager). */
export function hasProjectAccess(actor: ProjectActor): boolean {
  return isSystemAdmin(actor) || actor.projectRole !== null || actor.isSectionManagerOfProject
}

function granteesOf(actor: ProjectActor): Grantee[] {
  const grantees: Grantee[] = []
  if (actor.projectRole !== null) {
    grantees.push("member")
    if (actor.projectRole === "po" || actor.projectRole === "sm") grantees.push(actor.projectRole)
  }
  if (actor.isSectionManagerOfProject) grantees.push("section_manager")
  return grantees
}

/** Pure policy check: may `actor` perform `action` on the project? */
export function can(actor: ProjectActor, action: ProjectAction): boolean {
  if (isSystemAdmin(actor)) return true
  const allowed = POLICY[action]
  if (!allowed) return false
  return granteesOf(actor).some((g) => allowed.includes(g))
}

export type AccessVia = "admin" | "member" | "section_manager"

/** How the actor reached the project (kept for the `_accessVia` hint the UI reads). */
export function accessVia(actor: ProjectActor): AccessVia | null {
  if (isSystemAdmin(actor)) return "admin"
  if (actor.projectRole !== null) return "member"
  if (actor.isSectionManagerOfProject) return "section_manager"
  return null
}
