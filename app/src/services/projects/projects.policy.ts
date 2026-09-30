import { can, type ProjectActor } from "@/lib/authz/policy"
import { ForbiddenError } from "@/services/_shared/errors"
import type { UpdateProjectInput } from "./projects.schemas"

/**
 * Field-level authorization for PATCH /projects/:id (pure; called by the
 * route after `requireProject(projectId, "project.updateAppearance")`).
 * Card color alone is a cosmetic preference any member may set; everything
 * else needs "project.update", progress needs PO, sections need PO / admin.
 * Returns the refusal, or null when allowed.
 */
export function projectUpdateDenial(actor: ProjectActor, data: UpdateProjectInput): ForbiddenError | null {
  const keys = Object.keys(data).filter((k) => data[k as keyof UpdateProjectInput] !== undefined)
  const cardColorOnly = keys.length === 1 && keys[0] === "cardColor"
  if (!cardColorOnly && !can(actor, "project.update")) {
    return new ForbiddenError("権限がありません")
  }
  if (data.progressPct !== undefined && !can(actor, "project.updateProgress")) {
    return new ForbiddenError("進捗の編集は PO のみが行えます", {}, "PROGRESS_PO_ONLY")
  }
  if (data.sectionIds !== undefined && !can(actor, "project.updateSections")) {
    return new ForbiddenError("セクションの変更は PO または管理者が行えます", {}, "SECTIONS_PO_OR_ADMIN")
  }
  return null
}
