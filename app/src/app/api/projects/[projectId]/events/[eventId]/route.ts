import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateEventSchema } from "@/services/events/events.schemas"
import { deleteEvent, updateEvent } from "@/services/events/events.service"

type Params = { params: Promise<{ projectId: string; eventId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, eventId } = await params
  const gate = await requireProject(projectId, "event.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateEventSchema.parse(await request.json())
    return jsonResponse(await updateEvent(projectId, eventId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Event PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, eventId } = await params
  const gate = await requireProject(projectId, "event.write")
  if ("error" in gate) return gate.error

  try {
    await deleteEvent(projectId, eventId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Event DELETE" })
  }
}
