import { MS_MAX_PUNCH_ITEMS, MS_MAX_PUNCH_PHOTOS } from "@/lib/milestones/constants"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ValidationError } from "@/services/_shared/errors"
import * as parts from "./milestones.parts.repository"
import * as repo from "./milestones.repository"
import type { CreatePunchInput, UpdatePunchInput } from "./milestones.schemas"
import { assertRoom, assertStageLink, dayColumn, defined, logBoard, notFound, removeStoredFiles, storeUpload } from "./milestones.shared"

/**
 * 残課題 (punch list): found on the floor, so any member adds and works them
 * (milestone.track); deleting is plan.write. An assignee is a project member
 * (id; the name is copied) or just a name (the maker's engineer, a contractor).
 * Photos: images only, same storage / checks / quota as the KAIZEN photos.
 */

/** assigneeId must be a member; its current name wins over a typed name. */
async function assigneeColumns(db: Db, projectId: string, input: { assigneeId?: string | null; assigneeName?: string | null }) {
  if (input.assigneeId) {
    const member = await repo.findMemberName(db, projectId, input.assigneeId)
    if (!member) throw new ValidationError("担当者はプロジェクトメンバーから選択してください", {}, "PLAN_OWNER_NOT_MEMBER")
    return { assigneeId: input.assigneeId, assigneeName: member.user.name }
  }
  if (input.assigneeId === null) return { assigneeId: null, assigneeName: input.assigneeName || null }
  return input.assigneeName !== undefined ? { assigneeId: null, assigneeName: input.assigneeName || null } : {}
}

export async function createPunch(projectId: string, input: CreatePunchInput, actor: Actor) {
  return withTransaction(async (tx) => {
    assertRoom(await parts.countPunch(tx, projectId), MS_MAX_PUNCH_ITEMS)
    await assertStageLink(tx, projectId, input.planItemId)
    const item = await parts.insertPunch(tx, {
      projectId,
      title: input.title,
      detail: input.detail || null,
      planItemId: input.planItemId ?? null,
      dueDate: dayColumn(input.dueDate) ?? null,
      createdById: actor.userId,
      createdByName: actor.userName,
      ...(await assigneeColumns(tx, projectId, input)),
    })
    await logBoard(tx, projectId, actor, "punchItem", { from: null, to: input.title })
    return item
  })
}

/** done stamps closedAt; leaving done clears it. */
function statusColumns(status: UpdatePunchInput["status"], before: string, now: Date) {
  if (status === undefined || status === before) return {}
  return { status, closedAt: status === "done" ? now : null }
}

export async function updatePunch(projectId: string, punchId: string, input: UpdatePunchInput, actor: Actor, now: Date = new Date()) {
  return withTransaction(async (tx) => {
    const before = await parts.findPunch(tx, projectId, punchId)
    if (!before) throw notFound()
    await assertStageLink(tx, projectId, input.planItemId)
    const { status, dueDate, detail, assigneeId, assigneeName, ...rest } = input
    const item = await parts.updatePunch(tx, punchId, {
      ...defined(rest),
      ...(detail !== undefined ? { detail: detail || null } : {}),
      ...(dueDate !== undefined ? { dueDate: dayColumn(dueDate) } : {}),
      ...(await assigneeColumns(tx, projectId, { assigneeId, assigneeName })),
      ...statusColumns(status, before.status, now),
    })
    if (status !== undefined && status !== before.status) {
      await logBoard(tx, projectId, actor, "punchStatus", { from: before.status, to: status }, { punch: before.title })
    }
    return item
  })
}

export async function deletePunch(projectId: string, punchId: string, actor: Actor): Promise<void> {
  const files = await withTransaction(async (tx) => {
    const item = await parts.findPunch(tx, projectId, punchId)
    if (!item) throw notFound()
    const stored = await parts.findPunchFileNames(tx, punchId)
    await parts.deletePunch(tx, punchId)
    await logBoard(tx, projectId, actor, "punchItem", { from: item.title, to: null })
    return stored
  })
  await removeStoredFiles(projectId, files)
}

export async function uploadPunchPhoto(projectId: string, punchId: string, file: File | null, actor: Actor) {
  const item = await parts.findPunch(defaultDb, projectId, punchId)
  if (!item) throw notFound()
  assertRoom(await parts.countPunchPhotos(defaultDb, punchId), MS_MAX_PUNCH_PHOTOS)
  const saved = await storeUpload(projectId, file, { imageOnly: true })
  const photo = await parts.insertPunchPhoto(defaultDb, { punchItemId: punchId, ...saved })
  await logBoard(defaultDb, projectId, actor, "punchPhoto", { from: null, to: saved.originalName }, { punch: item.title })
  return photo
}

export async function getPunchPhoto(projectId: string, punchId: string, photoId: string) {
  const photo = await parts.findPunchPhoto(defaultDb, projectId, punchId, photoId)
  if (!photo) throw notFound()
  return photo
}

export async function deletePunchPhoto(projectId: string, punchId: string, photoId: string, actor: Actor): Promise<void> {
  const photo = await getPunchPhoto(projectId, punchId, photoId)
  await parts.deletePunchPhoto(defaultDb, photoId)
  await logBoard(defaultDb, projectId, actor, "punchPhoto", { from: photo.originalName, to: null })
  await removeStoredFiles(projectId, [photo])
}
