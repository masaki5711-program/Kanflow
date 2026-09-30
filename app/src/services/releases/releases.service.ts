import type { Actor } from "@/services/_shared/actor"
import { optionalDate } from "@/services/_shared/dates"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { attachI18n, attachI18nOne, enqueueIn, getI18nFor, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./releases.repository"
import type { ImportReleaseItemsInput, UpdateReleaseItemInput } from "./releases.schemas"

export async function listReleases(projectId: string) {
  const items = await repo.findReleaseItems(defaultDb, projectId)
  const [withI18n, pbI18n] = await Promise.all([
    attachI18n("release_item", items),
    getI18nFor("backlog_item", items.map((i) => i.pbItem?.id ?? "").filter(Boolean)),
  ])
  return withI18n.map((i) => ({
    ...i,
    pbItem: i.pbItem ? { ...i.pbItem, i18n: pbI18n.get(i.pbItem.id) ?? {} } : i.pbItem,
  }))
}

export async function updateReleaseItem(projectId: string, id: string, input: UpdateReleaseItemInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const { releaseDate, ...rest } = data
  const item = await withTransaction(async (tx) => {
    const updated = await repo.updateReleaseItem(tx, projectId, id, {
      ...rest,
      ...(releaseDate !== undefined ? { releaseDate: optionalDate(releaseDate) } : {}),
    })
    await enqueueIn(tx, "release_item", updated.id, data)
    return updated
  })
  return attachI18nOne("release_item", item)
}

export async function deleteReleaseItem(projectId: string, id: string): Promise<void> {
  await withTransaction(async (tx) => {
    await repo.deleteReleaseItem(tx, projectId, id)
    await purgeIn(tx, { release_item: [id] })
  })
}

/** Copy PBIs of the project into staged release items; returns the number created. */
export async function importReleaseItems(projectId: string, input: ImportReleaseItemsInput): Promise<{ created: number }> {
  return withTransaction(async (tx) => {
    const pbItems = await repo.findPbisForRelease(tx, projectId, input.pbItemIds)
    if (pbItems.length === 0) throw new NotFoundError("該当するPBIがありません", {}, "RELEASE_NO_PBI")
    for (const pb of pbItems) {
      const item = await repo.insertReleaseItem(tx, {
        projectId,
        planVersion: input.planVersion,
        pbItemId: pb.id,
        initiative: pb.initiative,
        epic: pb.epic,
        userStory: pb.userStory,
        assignedPo: pb.assignedPo,
        poNote: pb.poNote,
        status: "staged",
      })
      await enqueueIn(tx, "release_item", item.id, item)
    }
    return { created: pbItems.length }
  })
}
