import { requireAuth } from "@/lib/api-helpers"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createProjectSchema } from "@/services/projects/projects.schemas"
import { createProject } from "@/services/projects/projects.service"

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const input = createProjectSchema.parse(await request.json())
    return jsonResponse(await createProject(input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Project CREATE" })
  }
}
