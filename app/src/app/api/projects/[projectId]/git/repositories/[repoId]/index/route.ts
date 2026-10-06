import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { isGitEnabled } from "@/services/git/git.service"
import { findKnowledgeRepository } from "@/services/git/repo-knowledge.service"
import { startIndexInBackground } from "@/services/git/repo-index-runner"

type Params = { params: Promise<{ projectId: string; repoId: string }> }

/** Minimum gap between manual index runs of one repository (an up-to-date run is a single GitLab request). */
const MIN_GAP_MS = 30_000
const lastManual = new Map<string, number>()

/**
 * 今すぐ取り込む: index this knowledge repository now, in the background
 * (changed files only when already indexed). 202 `{ started: true }`; the
 * settings / Git page update live through the "git" realtime event.
 */
export async function POST(_request: Request, { params }: Params) {
  const { projectId, repoId } = await params
  const gate = await requireProject(projectId, "git.sync")
  if ("error" in gate) return gate.error
  try {
    if (!(await isGitEnabled(projectId))) return jsonResponse({ error: "Git integration is off", code: "CONFLICT" }, 409)
    const repo = await findKnowledgeRepository(projectId, repoId)
    if (!repo) return jsonResponse({ error: "Repository not found", code: "NOT_FOUND" }, 404)
    if (!repo.aiKnowledge) return jsonResponse({ error: "このリポジトリは AI の参照資料になっていません。", code: "CONFLICT" }, 409)
    const now = Date.now()
    if (now - (lastManual.get(repoId) ?? 0) < MIN_GAP_MS) return jsonResponse({ error: "Indexed a moment ago", code: "RATE_LIMITED" }, 429)
    if (!startIndexInBackground(repoId)) return jsonResponse({ error: "別のリポジトリを取り込み中です。少し待ってからもう一度押してください。", code: "CONFLICT" }, 409)
    // Old entries are dropped so the map cannot grow with removed repositories.
    for (const [id, at] of lastManual) if (now - at >= MIN_GAP_MS) lastManual.delete(id)
    lastManual.set(repoId, now)
    return jsonResponse({ started: true }, 202)
  } catch (error) {
    return toHttpResponse(error, { fallback: "取り込みを開始できませんでした", context: "Git repository index POST" })
  }
}
