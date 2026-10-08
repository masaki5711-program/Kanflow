import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { importRequestsSchema } from "@/services/improvements/improvements.schemas"
import { importFromRequests } from "@/services/improvements/improvements.service"

/** Pull 改善要望 (icebox items) onto the board. Body { iceboxIds } → { created, skipped }. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    const input = importRequestsSchema.parse(await request.json())
    return jsonResponse(await importFromRequests(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "取り込みに失敗しました", context: "Improvement import requests" })
  }
}
