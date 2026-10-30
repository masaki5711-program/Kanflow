import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { isGitEnabled, isProjectRepository, resyncRepository } from "@/services/git/git.service"
import { syncRepository } from "@/services/git/git-sync"

type Params = { params: Promise<{ projectId: string; repoId: string }> }

/**
 * Minimum gap between 過去分を再同期 of one repository. Each press restarts a
 * 90-day re-read that takes several syncs; pressing again sooner only restarts it.
 */
const MIN_GAP_MS = 10 * 60_000
const lastManual = new Map<string, number>()

/**
 * 過去分を再同期 (PO / SM / admin): the repository's merge requests and commits
 * of the last 90 days are read again over the next syncs (bounded per sync,
 * resumed), then one sync runs now. Gives `{ result }` of that sync.
 */
export async function POST(_request: Request, { params }: Params) {
  const { projectId, repoId } = await params
  const gate = await requireProject(projectId, "git.configure")
  if ("error" in gate) return gate.error
  try {
    if (!(await isGitEnabled(projectId))) return jsonResponse({ error: "Git integration is off", code: "CONFLICT" }, 409)
    // Ownership first: the rate limit is keyed only by repositories of this project.
    if (!(await isProjectRepository(projectId, repoId))) return jsonResponse({ error: "Repository not found", code: "NOT_FOUND" }, 404)
    // Check and claim in one synchronous step (no await between), so two concurrent presses cannot both pass.
    const now = Date.now()
    if (now - (lastManual.get(repoId) ?? 0) < MIN_GAP_MS) return jsonResponse({ error: "Resynced a moment ago", code: "RATE_LIMITED" }, 429)
    // Old entries are dropped so the map cannot grow with removed repositories.
    for (const [id, at] of lastManual) if (now - at >= MIN_GAP_MS) lastManual.delete(id)
    lastManual.set(repoId, now)
    try {
      await resyncRepository(projectId, repoId, actorFromSession(gate.session), new Date(now))
    } catch (error) {
      // Nothing was reset: the next press may try again at once.
      lastManual.delete(repoId)
      throw error
    }
    return jsonResponse({ result: await syncRepository(repoId) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "再同期を開始できませんでした", context: "Git repository resync POST" })
  }
}
