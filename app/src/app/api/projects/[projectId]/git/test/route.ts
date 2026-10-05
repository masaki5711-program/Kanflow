import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { testConnection, testConnectionSchema } from "@/services/git/git.service"

type Params = { params: Promise<{ projectId: string }> }

/** Connection test `{ url, token? }` (token omitted = the saved integration token) gives `{ ok, repository?, error? }`. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.configure")
  if ("error" in gate) return gate.error
  try {
    const input = testConnectionSchema.parse(await request.json())
    return jsonResponse(await testConnection(projectId, input.url, input.token))
  } catch (error) {
    return toHttpResponse(error, { fallback: "接続テストに失敗しました", context: "Git test POST" })
  }
}
