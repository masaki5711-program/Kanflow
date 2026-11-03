/** 設備・工程・タグ of a project (plan 12 §2.1, Q5: free strings until a master exists). Matching input of E2. */
import { logActivity } from "@/services/_shared/activity"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import type { AttributesInput } from "./actuals.schemas"

export interface ProjectAttributeDto {
  kind: string
  ref: string
}

export async function listAttributes(projectId: string, db: Db = defaultDb): Promise<ProjectAttributeDto[]> {
  return db.projectAttribute.findMany({ where: { projectId }, select: { kind: true, ref: true }, orderBy: [{ kind: "asc" }, { ref: "asc" }] })
}

/** Replace the project's attributes (duplicates collapse). Audited. */
export async function replaceAttributes(projectId: string, input: AttributesInput, actor: Actor): Promise<ProjectAttributeDto[]> {
  const unique = [...new Map(input.attributes.map((a) => [`${a.kind}\u0000${a.ref}`, a])).values()]
  return withTransaction(async (tx) => {
    await tx.projectAttribute.deleteMany({ where: { projectId } })
    if (unique.length) await tx.projectAttribute.createMany({ data: unique.map((a) => ({ projectId, kind: a.kind, ref: a.ref })) })
    await logActivity(tx, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes: { projectAttributes: { changed: true } }, meta: { count: unique.length } } })
    return listAttributes(projectId, tx)
  })
}
