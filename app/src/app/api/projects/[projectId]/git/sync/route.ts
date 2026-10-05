import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { isGitEnabled } from "@/services/git/git.service"
import { syncProject } from "@/services/git/git-sync"

type Params = { params: Promise<{ projectId: string }> }

/** Minimum gap between manual syncs of one project (each sync is several GitLab requests per repository). */
const MIN_GAP_MS = 20_000
const lastManual = new Map<string, number>()

/** Manual sync of every repository of the project, now. Gives `{ results }`. */
export async function POST(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.sync")
  if ("error" in gate) return gate.error
  try {
    if (!(await isGitEnabled(projectId))) return jsonResponse({ error: "Git integration is off", code: "CONFLICT" }, 409)
    const now = Date.now()
    if (now - (lastManual.get(projectId) ?? 0) < MIN_GAP_MS) return jsonResponse({ error: "Synced a moment ago", code: "RATE_LIMITED" }, 429)
    lastManual.set(projectId, now)
    return jsonResponse({ results: await syncProject(projectId) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "同期に失敗しました", context: "Git sync POST" })
  }
}
