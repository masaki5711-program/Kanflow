import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireProjectMember, requireProjectAccess } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  initiative: z.string().max(500).optional(),
  epic: z.string().max(500).optional(),
  userStory: z.string().optional(),
  acceptanceCriteria: z.string().max(5000).optional(),
  referenceDoc: z.string().max(10000).optional(),
  workloadScore: z.number().int().min(0).optional(),
  status: z.enum(["ready", "not_ready", "completed"]).optional(),
  iceboxItemId: z.string().optional(),
  productGoalId: z.string().nullable().optional(),
  assignedPo: z.string().max(200).optional(),
  poNote: z.string().max(5000).optional(),
  notReadyReason: z.string().max(5000).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectAccess(projectId, "read")
  if ("error" in result) return result.error

  const items = await prisma.productBacklogItem.findMany({
    where: { projectId },
    include: {
      iceboxItem: { select: { id: true, displayId: true, request: true } },
      productGoal: { select: { id: true, title: true } },
      // Sprints currently working on this PBI (planning/active only) so the
      // backlog list can mark Ready items that are already picked up.
      sprintItems: {
        where: { sprint: { status: { in: ["planning", "active"] } } },
        select: {
          sprint: { select: { id: true, sprintName: true, status: true } },
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })

  const readyItems = items.filter((i) => i.status === "ready")
  const notReadyItems = items.filter((i) => i.status === "not_ready")
  const completedItems = items.filter((i) => i.status === "completed")

  const totalWorkload = readyItems.reduce((sum, i) => sum + (i.workloadScore ?? 0), 0)

  return NextResponse.json({ readyItems, notReadyItems, completedItems, totalWorkload })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const session = await auth()
  const isAdmin = session?.user?.role === "admin"
  if (!isAdmin) {
    // PO can author from scratch; SM can also create PBIs when adding from
    // a sprint (sprint planning often surfaces missing PBIs that SM has to
    // turn into real items mid-flight).
    const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
    if ("error" in result) return result.error
  } else if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    if (data.productGoalId === "") data.productGoalId = null

    const last = await prisma.productBacklogItem.findFirst({
      where: { projectId },
      orderBy: { displayId: "desc" },
      select: { displayId: true },
    })
    const nextDisplayId = (last?.displayId ?? 0) + 1

    const maxOrder = await prisma.productBacklogItem.aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    })
    const nextOrder = (maxOrder._max.sortOrder ?? 0) + 1

    const item = await prisma.productBacklogItem.create({
      data: {
        projectId,
        displayId: nextDisplayId,
        sortOrder: nextOrder,
        initiative: data.initiative,
        epic: data.epic,
        userStory: data.userStory,
        acceptanceCriteria: data.acceptanceCriteria,
        referenceDoc: data.referenceDoc,
        workloadScore: data.workloadScore ?? 0,
        status: data.status ?? "not_ready",
        iceboxItemId: data.iceboxItemId || null,
        productGoalId: data.productGoalId ?? null,
        assignedPo: data.assignedPo,
        poNote: data.poNote,
        notReadyReason: data.notReadyReason,
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Backlog CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
