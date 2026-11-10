import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getMergeHistory, mergeHistoryQuerySchema } from "@/services/git/merge-history.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * マージの履歴 of the Git page: merged merge requests linked to PBIs, newest first
 * (`?from=&to=&repositoryId=&cursor=&limit=`). Read from Kanflow's synced copy;
 * `{ enabled: false }` when the integration is off.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  try {
    const query = mergeHistoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    return jsonResponse(await getMergeHistory(projectId, query))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Git merge history GET" })
  }
}
