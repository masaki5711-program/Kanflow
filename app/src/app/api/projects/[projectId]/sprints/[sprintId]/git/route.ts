import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { applyGitTaskAction, getDailyScrumGitDraft, getSprintGitInsights, getSprintReleaseNote } from "@/services/git/git-insights.service"
import { reportLang } from "@/services/git/git-reports"

type Params = { params: Promise<{ projectId: string; sprintId: string }> }

/**
 * GET ?view=insights (default) | draft | release [&lang=ja|en|id]
 * insights: task suggestions + warnings from Git; draft: Daily Scrum text; release: release note.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  const q = new URL(request.url).searchParams
  const lang = reportLang(q.get("lang"))
  try {
    switch (q.get("view")) {
      case "draft":
        return jsonResponse(await getDailyScrumGitDraft(projectId, sprintId, lang))
      case "release":
        return jsonResponse(await getSprintReleaseNote(projectId, sprintId, lang))
      default:
        return jsonResponse(await getSprintGitInsights(projectId, sprintId))
    }
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Sprint git GET" })
  }
}

const actionSchema = z.object({ pbItemId: z.string().min(1).max(191), action: z.enum(["start", "complete"]) }).strict()

/** Accepts a suggestion: moves the PBI's tasks to in progress / done. */
export async function POST(request: Request, { params }: Params) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "task.write")
  if ("error" in gate) return gate.error
  try {
    const input = actionSchema.parse(await request.json())
    return jsonResponse(await applyGitTaskAction(projectId, sprintId, input.pbItemId, input.action, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Sprint git POST" })
  }
}
