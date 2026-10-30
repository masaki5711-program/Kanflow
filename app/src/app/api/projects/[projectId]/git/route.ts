import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { getGitSettings, gitSettingsSchema, updateGitSettings } from "@/services/git/git.service"

type Params = { params: Promise<{ projectId: string }> }

/** Integration settings (`enabled`, `hasToken` + last 4 characters, never the token) and repositories. */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await getGitSettings(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Git settings GET" })
  }
}

/** `{ enabled?, token? (null = remove), autoCompleteOnMerge?, provider? ("gitlab" only; one source per project) }` (PO / SM / admin). */
export async function PUT(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.configure")
  if ("error" in gate) return gate.error
  try {
    const input = gitSettingsSchema.parse(await request.json())
    return jsonResponse(await updateGitSettings(projectId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Git settings PUT" })
  }
}
