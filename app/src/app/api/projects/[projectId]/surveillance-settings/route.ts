import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { surveillanceSettingsSchema } from "@/lib/surveillance-settings"
import { getSurveillanceSettings, updateSurveillanceSettings } from "@/services/surveillance-settings/surveillance-settings.service"

type Params = { params: Promise<{ projectId: string }> }

/** Current thresholds (defaults filled in) → `{ settings }`. */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse({ settings: await getSurveillanceSettings(projectId) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "SurveillanceSettings GET" })
  }
}

/** Full settings object (every field) → `{ settings }`. PO / admin only. */
export async function PUT(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "surveillance.configure")
  if ("error" in gate) return gate.error
  try {
    const input = surveillanceSettingsSchema.parse(await request.json())
    const settings = await updateSurveillanceSettings(projectId, input, actorFromSession(gate.session))
    return jsonResponse({ settings })
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "SurveillanceSettings PUT" })
  }
}
