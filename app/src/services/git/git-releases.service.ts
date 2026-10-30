import { prisma } from "@/lib/prisma"
import { pbiKey } from "@/lib/git/pbi-keys"
import { NotFoundError } from "@/services/_shared/errors"
import type { Actor } from "@/services/_shared/actor"
import { updateReleaseItem } from "@/services/releases/releases.service"
import { isGitEnabled } from "./git.service"
import { findTag, pbiReadiness, previousTag, type TagInfo } from "./git-release-rules"
import { formatReleaseNote, type ReportLang } from "./git-reports"

/**
 * What Git says about the release tab: per plan version, whether it is tagged,
 * how many planned PBIs are really merged, which merged work was never planned,
 * a one-click "release it" (never automatic) and a version release note.
 */
const FALLBACK_NOTE_DAYS = 30
const DAY_MS = 86_400_000
const MAX_LISTED = 20
/** A version counts as still open for release in these states. */
const OPEN_STATUSES = ["staged", "ready"]

interface PlannedItem {
  id: string
  planVersion: string | null
  status: string
  pbItemId: string | null
}

export interface VersionGitStatus {
  version: string
  tag: { tag: string; url: string; releasedAt: string; hasRelease: boolean } | null
  /** Items of the version that are linked to a PBI. */
  planned: number
  merged: number
  pending: Array<{ pbItemId: string; displayId: number; title: string }>
  /** Merged between the previous tag and this one, but in no release item at all (tagged versions only). */
  unplanned: Array<{ displayId: number; title: string; ref: string; url: string }>
  /** Tagged, with items still staged / ready: the one-click "mark as released" applies. */
  canRelease: boolean
}

const day = (d: Date) => d.toISOString().slice(0, 10)

const titleOf = (p: { displayId: number; initiative: string | null; userStory: string | null }) =>
  p.initiative || p.userStory?.slice(0, 80) || pbiKey(p.displayId)

async function loadTags(projectId: string): Promise<TagInfo[]> {
  return prisma.gitRelease.findMany({
    where: { projectId },
    select: { tag: true, name: true, description: true, url: true, releasedAt: true },
    orderBy: { releasedAt: "desc" },
  })
}

async function loadItems(projectId: string): Promise<PlannedItem[]> {
  return prisma.releaseBacklogItem.findMany({
    where: { projectId },
    select: { id: true, planVersion: true, status: true, pbItemId: true },
  })
}

/** Merged MRs in (from, to], with the PBI they belong to. */
async function mergedBetween(projectId: string, from: Date | null, to: Date) {
  return prisma.gitLink.findMany({
    // Declared-only links (dev:write) are display, never delivery evidence.
    where: { projectId, kind: "mr", state: "merged", declaredAt: null, mergedAt: { ...(from ? { gt: from } : {}), lte: to } },
    select: { backlogItemId: true, ref: true, title: true, url: true, author: true, backlogItem: { select: { displayId: true, initiative: true, userStory: true, deletedAt: true } } },
    orderBy: { mergedAt: "asc" },
  })
}

export async function getReleaseGitStatus(projectId: string): Promise<{ enabled: boolean; versions: VersionGitStatus[] }> {
  if (!(await isGitEnabled(projectId))) return { enabled: false, versions: [] }
  const [tags, items] = await Promise.all([loadTags(projectId), loadItems(projectId)])
  const versions = [...new Set(items.map((i) => i.planVersion).filter((v): v is string => !!v))]
  const plannedIds = [...new Set(items.map((i) => i.pbItemId).filter((id): id is string => !!id))]
  const [links, pbis] = await Promise.all([
    prisma.gitLink.findMany({ where: { projectId, kind: "mr", declaredAt: null, backlogItemId: { in: plannedIds } }, select: { backlogItemId: true, state: true, mergedAt: true } }),
    prisma.productBacklogItem.findMany({ where: { id: { in: plannedIds }, deletedAt: null }, select: { id: true, displayId: true, initiative: true, userStory: true } }),
  ])
  const pbiById = new Map(pbis.map((p) => [p.id, p]))
  const everPlanned = new Set(plannedIds)

  const out: VersionGitStatus[] = []
  for (const version of versions) {
    const mine = items.filter((i) => i.planVersion === version)
    const tag = findTag(version, tags)
    const ids = [...new Set(mine.map((i) => i.pbItemId).filter((id): id is string => !!id && pbiById.has(id)))]
    const pending: VersionGitStatus["pending"] = []
    let merged = 0
    for (const id of ids) {
      const mrs = links.filter((l) => l.backlogItemId === id)
      if (pbiReadiness(mrs, tag?.releasedAt ?? null) === "merged") merged++
      else pending.push({ pbItemId: id, displayId: pbiById.get(id)!.displayId, title: titleOf(pbiById.get(id)!) })
    }
    out.push({
      version,
      tag: tag ? { tag: tag.tag, url: tag.url, releasedAt: tag.releasedAt.toISOString(), hasRelease: tag.description !== null || tag.name !== null } : null,
      planned: ids.length,
      merged,
      pending,
      unplanned: tag ? await unplannedFor(projectId, tag, tags, everPlanned) : [],
      canRelease: !!tag && mine.some((i) => OPEN_STATUSES.includes(i.status)),
    })
  }
  return { enabled: true, versions: out }
}

async function unplannedFor(projectId: string, tag: TagInfo, tags: readonly TagInfo[], everPlanned: ReadonlySet<string>): Promise<VersionGitStatus["unplanned"]> {
  const prev = previousTag(tag, tags)
  // Without a previous tag the window is unbounded: listing the whole history would only be noise.
  if (!prev) return []
  const rows = await mergedBetween(projectId, prev.releasedAt, tag.releasedAt)
  return rows
    .filter((r) => !everPlanned.has(r.backlogItemId) && !r.backlogItem.deletedAt)
    .slice(0, MAX_LISTED)
    .map((r) => ({ displayId: r.backlogItem.displayId, title: titleOf(r.backlogItem), ref: r.ref, url: r.url }))
}

/** Marks a tagged version's staged / ready items as released, with the tag's date, name and release text. */
export async function releaseVersionFromTag(projectId: string, version: string, actor: Actor): Promise<{ updated: number; pending: number }> {
  const status = await getReleaseGitStatus(projectId)
  const v = status.versions.find((s) => s.version === version)
  if (!v?.tag || !v.canRelease) return { updated: 0, pending: 0 }
  const tag = findTag(version, await loadTags(projectId))
  if (!tag) return { updated: 0, pending: 0 }
  const targets = await prisma.releaseBacklogItem.findMany({
    where: { projectId, planVersion: version, status: { in: OPEN_STATUSES } },
    select: { id: true, releaseVersion: true, releaseNote: true },
  })
  for (const item of targets) {
    await updateReleaseItem(
      projectId,
      item.id,
      {
        status: "released",
        releaseDate: tag.releasedAt.toISOString(),
        releaseVersion: item.releaseVersion ?? tag.tag,
        ...(item.releaseNote ? {} : tag.description ? { releaseNote: tag.description } : {}),
      },
      actor,
    )
  }
  return { updated: targets.length, pending: v.pending.length }
}

export interface VersionReleaseNote {
  enabled: boolean
  text: string
  mergedCount: number
  tag: { tag: string; url: string; releasedAt: string } | null
  /** The GitLab release description of the tag, shown next to the generated list. */
  description: string | null
}

/** Merged MRs from the previous tag to this version's tag (or to now while untagged), per PBI. */
export async function getVersionReleaseNote(projectId: string, version: string, lang: ReportLang, now = new Date()): Promise<VersionReleaseNote> {
  if (!(await isGitEnabled(projectId))) return { enabled: false, text: "", mergedCount: 0, tag: null, description: null }
  const known = await prisma.releaseBacklogItem.count({ where: { projectId, planVersion: version } })
  if (known === 0) throw new NotFoundError("Release version not found")
  const tags = await loadTags(projectId)
  const tag = findTag(version, tags)
  const to = tag?.releasedAt ?? now
  const lower = tag ? previousTag(tag, tags) : tags[0]
  const from = lower?.releasedAt ?? new Date(to.getTime() - FALLBACK_NOTE_DAYS * DAY_MS)
  const rows = await mergedBetween(projectId, from, to)

  const byPbi = new Map<string, { displayId: number; title: string; mrs: Array<{ ref: string; title: string; url: string; author: string | null }> }>()
  for (const r of rows) {
    if (r.backlogItem.deletedAt) continue
    const entry = byPbi.get(r.backlogItemId) ?? { displayId: r.backlogItem.displayId, title: titleOf(r.backlogItem), mrs: [] }
    entry.mrs.push({ ref: r.ref, title: r.title, url: r.url, author: r.author })
    byPbi.set(r.backlogItemId, entry)
  }
  const pbis = [...byPbi.values()].sort((a, b) => a.displayId - b.displayId)
  return {
    enabled: true,
    text: formatReleaseNote({ name: version, from: day(from), to: day(to) }, pbis, lang),
    mergedCount: pbis.reduce((n, p) => n + p.mrs.length, 0),
    tag: tag ? { tag: tag.tag, url: tag.url, releasedAt: tag.releasedAt.toISOString() } : null,
    description: tag?.description ?? null,
  }
}
