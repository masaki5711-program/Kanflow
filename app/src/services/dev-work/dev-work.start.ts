/**
 * N7 (docs/integration/gitstation-operations-plan.md §3): what an AI session needs to start on a PBI, from Kanflow's
 * own data (the 写し the Git sync keeps) — Kanflow never calls GitStation here and never creates a branch or an MR.
 *
 * - `pbiDevelopment`: the branch name suggestion, the project's repositories, and the PBI's merge requests with their
 *   state, why they cannot merge, the predicted conflicts and the pipeline (as last read; `readAt` says when). Used by
 *   get_pbi and start_work.
 * - `startCommands`: the commands the session runs next (git, then gstn / glab). DATA for the session to run with the
 *   user's own tokens — Kanflow executes nothing. The MR description carries only keys (PBI-12, PBI-12/AC-2) and the
 *   session id, never the PBI's text (a PBI may become confidential later; a copied text would stay).
 */
import { prisma } from "@/lib/prisma"
import { pbiKey, suggestBranchName } from "@/lib/git/pbi-keys"
import { parseDetail } from "@/components/git-dev/merge-state-model"
import { toMergeStateDto, type GitMergeStateDto } from "@/services/git/git.service"

/** MR links of the PBI answered (newest change first). */
export const DEVELOPMENT_MRS_MAX = 20

export interface PbiDevelopmentDto {
  /** false = the project has no (enabled) Git integration: nothing else is filled. */
  enabled: boolean
  /** "gitstation" | "gitlab" (the project reads its development data from one source). */
  provider: string | null
  pbiKey: string
  branchSuggestion: string
  repositories: { id: string; name: string; webUrl: string; path: string; syncedAt: string | null }[]
  mergeRequests: {
    repository: string
    ref: string
    title: string
    url: string
    state: string | null
    sourceBranch: string | null
    targetBranch: string | null
    author: string | null
    pipeline: string | null
    /** Why it cannot merge and its predicted conflicts as last read (GitStation, open MRs); null = not read. */
    merge: GitMergeStateDto | null
    /** When the sync last changed this link. */
    updatedAt: string
  }[]
  /** The newest successful sync of the project's repositories: the copy is at most one sync interval older. */
  readAt: string | null
}

const OPEN = ["opened", "locked"]

/** GitStation `detail` keys passed on to a token client: counts and the check's name — never free text. */
const DETAIL_KEYS = ["required", "counted", "name", "count"] as const

/**
 * Pure (plan §10): a merge state for a token client — each reason's `detail` cut down to the few known facts
 * (`required=2 counted=1`, `name=ci/test`, `count=3`), each value one short line. GitStation's other text stays out.
 */
export function tokenMergeState(merge: GitMergeStateDto | null): GitMergeStateDto | null {
  if (!merge) return null
  return {
    ...merge,
    blockers: merge.blockers.map((b) => {
      const d = parseDetail(b.detail)
      const facts = DETAIL_KEYS.flatMap((k) => (d[k] ? [`${k}=${d[k].replace(/[\s\x00-\x1f\x7f]+/g, " ").trim().slice(0, 80)}`] : []))
      return { reason: b.reason, detail: facts.length > 0 ? facts.join(" ") : null }
    }),
  }
}

/** The PBI's development data (the PBI is a live PBI of the project the caller may see — checked by the caller). */
export async function pbiDevelopment(projectId: string, pbi: { id: string; displayId: number; initiative: string | null; epic: string | null }): Promise<PbiDevelopmentDto> {
  const base = { pbiKey: pbiKey(pbi.displayId), branchSuggestion: suggestBranchName(pbi.displayId, pbi.initiative ?? pbi.epic) }
  const integration = await prisma.gitIntegration.findUnique({ where: { projectId }, select: { enabled: true, provider: true } })
  if (!integration?.enabled) return { enabled: false, provider: null, ...base, repositories: [], mergeRequests: [], readAt: null }
  const [repositories, links] = await Promise.all([
    prisma.gitRepository.findMany({
      where: { projectId },
      select: { id: true, name: true, webUrl: true, repoPath: true, syncedAt: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.gitLink.findMany({
      where: { projectId, backlogItemId: pbi.id, kind: "mr" },
      select: {
        ref: true,
        title: true,
        url: true,
        state: true,
        sourceBranch: true,
        targetBranch: true,
        author: true,
        pipeline: true,
        mergeBlockers: true,
        mergeable: true,
        conflictPrediction: true,
        mergeStatusAt: true,
        updatedAt: true,
        repository: { select: { name: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
      take: DEVELOPMENT_MRS_MAX,
    }),
  ])
  const synced = repositories.map((r) => r.syncedAt?.getTime() ?? 0).filter((t) => t > 0)
  return {
    enabled: true,
    provider: integration.provider,
    ...base,
    repositories: repositories.map((r) => ({ id: r.id, name: r.name, webUrl: r.webUrl, path: r.repoPath, syncedAt: r.syncedAt?.toISOString() ?? null })),
    mergeRequests: links.map((l) => ({
      repository: l.repository.name,
      ref: l.ref,
      title: l.title,
      url: l.url,
      state: l.state,
      sourceBranch: l.sourceBranch,
      targetBranch: l.targetBranch,
      author: l.author,
      pipeline: l.pipeline,
      merge: OPEN.includes(l.state ?? "") ? tokenMergeState(toMergeStateDto(l)) : null,
      updatedAt: l.updatedAt.toISOString(),
    })),
    readAt: synced.length > 0 ? new Date(Math.max(...synced)).toISOString() : null,
  }
}

/** One step the session runs next (data only). */
export interface StartCommand {
  step: "branch" | "push" | "draft_mr"
  command: string
  note: string
}

/** Quote one shell argument (POSIX single quotes; the values are Kanflow's own ids and keys, but never trust them). */
const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

/** Pure: the commands to start on a branch and open a draft MR (no MR when the PBI already has an open one). */
export function startCommands(input: { provider: string | null; branch: string; pbiKey: string; criteria: readonly string[]; sessionId: string; hasOpenMr: boolean }): StartCommand[] {
  const b = quote(input.branch)
  const out: StartCommand[] = [
    { step: "branch", command: `git switch -c ${b}`, note: "Create the branch locally (GitStation has no branch API; Kanflow creates nothing)." },
    { step: "push", command: `git push -u origin ${b}`, note: "After the first commit." },
  ]
  if (input.hasOpenMr) return out
  const refs = [input.pbiKey, ...input.criteria].join(", ")
  // The session id goes into a command only when it cannot break any shell's quoting (POSIX, PowerShell, cmd).
  const session = /^[A-Za-z0-9._:-]{1,100}$/.test(input.sessionId) ? input.sessionId : "<sessionId>"
  const description = `Refs: ${refs}\nKanflow-Session: ${session}`
  const title = quote(`${input.pbiKey}: <short title>`)
  out.push(
    input.provider === "gitlab"
      ? { step: "draft_mr", command: `glab mr create --draft --source-branch ${b} --title ${title} --description ${quote(description)}`, note: "With your own GitLab token. Keys only in the description: never copy the PBI's text." }
      : {
          step: "draft_mr",
          command: `gstn mr create --draft --source ${b} --title ${title} --description ${quote(description)}`,
          note: "With your own GitStation token issued as an AI token (is_agent): it cannot approve or merge. Keys only in the description: never copy the PBI's text. Check `gstn mr create --help` for the exact flags of your version.",
        },
  )
  return out
}
