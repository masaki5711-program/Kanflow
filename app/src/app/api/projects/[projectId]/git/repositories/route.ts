import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { addRepository, addRepositorySchema } from "@/services/git/git.service"

type Params = { params: Promise<{ projectId: string }> }

/** Add a repository `{ name, url, token? }`; refused (400) when the connection test fails. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.configure")
  if ("error" in gate) return gate.error
  try {
    const input = addRepositorySchema.parse(await request.json())
    return jsonResponse(await addRepository(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "リポジトリを追加できませんでした", context: "Git repository POST" })
  }
}
