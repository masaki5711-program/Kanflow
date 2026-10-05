import { MS_MAX_DOCUMENT_FILES, MS_MAX_DOCUMENTS } from "@/lib/milestones/constants"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import * as parts from "./milestones.parts.repository"
import type { CreateDocumentInput, UpdateDocumentInput } from "./milestones.schemas"
import { assertRoom, defined, logBoard, notFound, removeStoredFiles, storeUpload } from "./milestones.shared"

/**
 * 引き渡し資料 checklist: the PO / SM keep the list (plan.write); anyone
 * marks a document 揃った / 未提出 and attaches its files (milestone.track).
 * Files: same allow-list, content check, size cap and quota as PBI 参考資料.
 */

export async function createDocument(projectId: string, input: CreateDocumentInput, actor: Actor) {
  return withTransaction(async (tx) => {
    assertRoom(await parts.countDocuments(tx, projectId), MS_MAX_DOCUMENTS)
    const doc = await parts.insertDocument(tx, projectId, input.name)
    await logBoard(tx, projectId, actor, "handoverDocument", { from: null, to: input.name })
    return doc
  })
}

/** received stamps when / who; back to pending clears them. */
function statusColumns(status: UpdateDocumentInput["status"], before: string, actor: Actor, now: Date) {
  if (status === undefined || status === before) return {}
  return status === "received" ? { status, receivedAt: now, receivedByName: actor.userName } : { status, receivedAt: null, receivedByName: null }
}

export async function updateDocument(projectId: string, documentId: string, input: UpdateDocumentInput, actor: Actor, now: Date = new Date()) {
  return withTransaction(async (tx) => {
    const before = await parts.findDocument(tx, projectId, documentId)
    if (!before) throw notFound()
    const { status, note, ...rest } = input
    const doc = await parts.updateDocument(tx, documentId, {
      ...defined(rest),
      ...(note !== undefined ? { note: note || null } : {}),
      ...statusColumns(status, before.status, actor, now),
    })
    if (status !== undefined && status !== before.status) {
      await logBoard(tx, projectId, actor, "handoverStatus", { from: before.status, to: status }, { document: before.name })
    }
    return doc
  })
}

export async function deleteDocument(projectId: string, documentId: string, actor: Actor): Promise<void> {
  const files = await withTransaction(async (tx) => {
    const doc = await parts.findDocument(tx, projectId, documentId)
    if (!doc) throw notFound()
    const stored = await parts.findDocumentFileNames(tx, documentId)
    await parts.deleteDocument(tx, documentId)
    await logBoard(tx, projectId, actor, "handoverDocument", { from: doc.name, to: null })
    return stored
  })
  await removeStoredFiles(projectId, files)
}

export async function uploadDocumentFile(projectId: string, documentId: string, file: File | null, actor: Actor) {
  const doc = await parts.findDocument(defaultDb, projectId, documentId)
  if (!doc) throw notFound()
  assertRoom(await parts.countDocumentFiles(defaultDb, documentId), MS_MAX_DOCUMENT_FILES)
  const saved = await storeUpload(projectId, file, { imageOnly: false })
  const row = await parts.insertDocumentFile(defaultDb, { documentId, ...saved, uploadedByName: actor.userName })
  await logBoard(defaultDb, projectId, actor, "handoverFile", { from: null, to: saved.originalName }, { document: doc.name })
  return row
}

export async function getDocumentFile(projectId: string, documentId: string, fileId: string) {
  const file = await parts.findDocumentFile(defaultDb, projectId, documentId, fileId)
  if (!file) throw notFound()
  return file
}

export async function deleteDocumentFile(projectId: string, documentId: string, fileId: string, actor: Actor): Promise<void> {
  const file = await getDocumentFile(projectId, documentId, fileId)
  await parts.deleteDocumentFile(defaultDb, fileId)
  await logBoard(defaultDb, projectId, actor, "handoverFile", { from: file.originalName, to: null })
  await removeStoredFiles(projectId, [file])
}
