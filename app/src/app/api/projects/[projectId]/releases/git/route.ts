import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { getReleaseGitStatus, getVersionReleaseNote, releaseVersionFromTag } from "@/services/git/git-releases.service"
import { reportLang } from "@/services/git/git-reports"

type Params = { params: Promise<{ projectId: string }> }

/**
 * GET ?view=status (default) | note&version=<plan version> [&lang=ja|en|id]
 * status: per version, tag + merged / pending PBIs + unplanned work; note: version release note.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  const q = new URL(request.url).searchParams
  try {
    if (q.get("view") === "note") {
      const version = q.get("version")?.trim()
      if (!version) return jsonResponse({ error: "version is required", code: "VERSION_REQUIRED" }, 400)
      return jsonResponse(await getVersionReleaseNote(projectId, version, reportLang(q.get("lang"))))
    }
    return jsonResponse(await getReleaseGitStatus(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Release git GET" })
  }
}

const releaseSchema = z.object({ version: z.string().min(1).max(100), action: z.literal("release") }).strict()

/** Accepts the "tagged → mark as released" suggestion for one version. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error
  try {
    const input = releaseSchema.parse(await request.json())
    return jsonResponse(await releaseVersionFromTag(projectId, input.version, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Release git POST" })
  }
}
