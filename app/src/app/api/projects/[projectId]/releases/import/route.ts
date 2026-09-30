import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { importReleaseItemsSchema } from "@/services/releases/releases.schemas"
import { importReleaseItems } from "@/services/releases/releases.service"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    const input = importReleaseItemsSchema.parse(await request.json())
    return jsonResponse(await importReleaseItems(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "取り込みに失敗しました", context: "Release import" })
  }
}
