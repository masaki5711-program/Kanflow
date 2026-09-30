import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { assignCategorySchema } from "@/services/user-categories/user-categories.schemas"
import { assignProject, unassignProject } from "@/services/user-categories/user-categories.service"

type Params = { params: Promise<{ categoryId: string }> }

export async function POST(request: Request, { params }: Params) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { categoryId } = await params

  try {
    const { projectId } = assignCategorySchema.parse(await request.json())
    return jsonResponse(await assignProject(gate.session.user.id, categoryId, projectId), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "割当に失敗しました", context: "Assignment CREATE" })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { categoryId } = await params

  const projectId = new URL(request.url).searchParams.get("projectId")
  if (!projectId) return NextResponse.json({ error: "projectId required", code: "VALIDATION" }, { status: 400 })

  try {
    await unassignProject(gate.session.user.id, categoryId, projectId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Assignment DELETE" })
  }
}
