import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { pbiKey } from "@/lib/git/pbi-keys"
import { toMergeStateDto, type GitMergeStateDto } from "./git.service"

/**
 * N10 (docs/integration/gitstation-operations-plan.md §8): 自分の MR で止まっているもの — on the dashboard's 自分のタスク,
 * beside 承認を待っている MR: the signed-in user's open merge requests that GitStation says cannot merge yet, or that are
 * predicted to conflict, with why and who acts next (the PBI panel's view). From Kanflow's copy (the Git sync): no
 * GitStation call when the dashboard opens.
 *
 * "Mine" — Kanflow keeps no GitStation user id, so an MR is the user's when either holds:
 * - `branch`: its source branch is the branch of one of the user's work claims in the project (heartbeat within 7 days);
 * - `author`: its author is exactly (ignoring case) the user's name or employee number, or the author's employee
 *   number GitStation's development status named (authorEmployeeNumber) is the user's.
 * Neither is proof of identity (a namesake's MR, or one on a branch someone else also claimed, may appear); it only
 * decides what this list shows to the user themselves, inside a project they are a member of. The branch is checked
 * first.
 */

/** Rows shown. */
export const MY_BLOCKED_MRS_MAX = 20
/** Claims looked at (the user's open claims within the look-back). */
const CLAIMS_READ = 100
const CLAIM_LOOKBACK_MS = 7 * 24 * 60 * 60_000
const OPEN = ["opened", "locked"]
/** The user's open MR links read (newest change first); reaching it is logged. */
const LINKS_READ = 300
const log = logger.child({ module: "git-my-blocked-mrs" })

export interface MyBlockedMrItem {
  linkId: string
  iid: string
  title: string
  url: string
  repository: string
  pbiId: string
  pbiKey: string
  pbiDisplayId: number
  /** Why the MR counts as the user's. */
  mine: "branch" | "author"
  branch: string | null
  merge: GitMergeStateDto
}

export interface MyBlockedMrsResult {
  /** false = the project does not read Git (nothing is shown). */
  enabled: boolean
  items: MyBlockedMrItem[]
}

/** Pure: whether a stored state shows something to act on (a blocking reason, or a predicted conflict). */
export function needsAction(merge: GitMergeStateDto | null): merge is GitMergeStateDto {
  return merge !== null && (merge.blockers.length > 0 || (merge.conflicts?.peers.some((p) => p.outcome === "conflict") ?? false))
}

/**
 * Pure: why an MR is the user's, or null. `employeeNumber`: the user's (lower-case), matched against the author's
 * employee number GitStation named (authorEmployeeNumber) — counted as `author` too.
 */
export function mineBy(
  link: { sourceBranch: string | null; author: string | null; authorEmployeeNumber?: string | null },
  branches: ReadonlySet<string>,
  names: readonly string[],
  employeeNumber: string | null = null,
): "branch" | "author" | null {
  if (link.sourceBranch && branches.has(link.sourceBranch)) return "branch"
  const author = link.author?.trim().toLowerCase()
  if (author && names.some((n) => n === author)) return "author"
  if (employeeNumber && link.authorEmployeeNumber?.trim().toLowerCase() === employeeNumber) return "author"
  return null
}

export async function getMyBlockedMrs(projectId: string, userId: string, now: Date = new Date()): Promise<MyBlockedMrsResult> {
  const integration = await prisma.gitIntegration.findUnique({ where: { projectId }, select: { enabled: true } })
  if (!integration?.enabled) return { enabled: false, items: [] }
  const [user, claims] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, employeeNumber: true } }),
    prisma.workClaim.findMany({
      where: { projectId, userId, releasedAt: null, heartbeatAt: { gte: new Date(now.getTime() - CLAIM_LOOKBACK_MS) }, branch: { not: null } },
      select: { branch: true },
      orderBy: { heartbeatAt: "desc" },
      take: CLAIMS_READ,
    }),
  ])
  const branches = new Set(claims.flatMap((c) => (c.branch ? [c.branch] : [])))
  const names = [user?.name, user?.employeeNumber].flatMap((n) => (n && n.trim() ? [n.trim().toLowerCase()] : []))
  const employeeNumber = user?.employeeNumber?.trim().toLowerCase() || null
  if (branches.size === 0 && names.length === 0) return { enabled: true, items: [] }
  const links = await prisma.gitLink.findMany({
    where: {
      projectId,
      kind: "mr",
      state: { in: OPEN },
      mergeStatusAt: { not: null },
      backlogItem: { deletedAt: null },
      OR: [
        ...(branches.size > 0 ? [{ sourceBranch: { in: [...branches] } }] : []),
        ...(names.length > 0 ? [{ author: { in: names, mode: "insensitive" as const } }] : []),
        ...(employeeNumber ? [{ authorEmployeeNumber: { equals: employeeNumber, mode: "insensitive" as const } }] : []),
      ],
    },
    select: {
      id: true,
      ref: true,
      title: true,
      url: true,
      sourceBranch: true,
      author: true,
      authorEmployeeNumber: true,
      mergeBlockers: true,
      mergeable: true,
      conflictPrediction: true,
      mergeStatusAt: true,
      repositoryId: true,
      repository: { select: { name: true } },
      backlogItem: { select: { id: true, displayId: true } },
    },
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    take: LINKS_READ,
  })
  if (links.length >= LINKS_READ) log.warn("my blocked merge requests: read bound reached, older ones not checked", { projectId, limit: LINKS_READ })
  const seen = new Set<string>()
  const items: MyBlockedMrItem[] = []
  for (const l of links) {
    const merge = toMergeStateDto(l)
    const mine = mineBy(l, branches, names, employeeNumber)
    // One row per MR (an MR linked to two PBIs shows once, under the first).
    const key = `${l.repositoryId}\n${l.ref}`
    if (!mine || !needsAction(merge) || seen.has(key)) continue
    seen.add(key)
    items.push({
      linkId: l.id,
      iid: l.ref,
      title: l.title,
      url: l.url,
      repository: l.repository.name,
      pbiId: l.backlogItem.id,
      pbiKey: pbiKey(l.backlogItem.displayId),
      pbiDisplayId: l.backlogItem.displayId,
      mine,
      branch: l.sourceBranch,
      merge,
    })
    if (items.length >= MY_BLOCKED_MRS_MAX) break
  }
  return { enabled: true, items }
}
