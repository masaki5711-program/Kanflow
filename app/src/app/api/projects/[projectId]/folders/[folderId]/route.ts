import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  /** Reparent. null = move to root. */
  parentId: z.string().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; folderId: string }> }
) {
  const { projectId, folderId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    // Guard: parentId must not equal self and must not create a cycle.
    if (data.parentId === folderId) {
      return NextResponse.json({ error: "自分自身を親にはできません" }, { status: 400 })
    }
    if (data.parentId) {
      // Walk up to ensure folderId is not in the new parent's ancestry.
      let cursor: string | null = data.parentId
      const seen = new Set<string>()
      while (cursor) {
        if (cursor === folderId) {
          return NextResponse.json({ error: "循環参照になります" }, { status: 400 })
        }
        if (seen.has(cursor)) break
        seen.add(cursor)
        const parent: { parentId: string | null } | null = await prisma.attachmentFolder.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        })
        cursor = parent?.parentId ?? null
      }
    }

    const folder = await prisma.attachmentFolder.update({
      where: { id: folderId, projectId },
      data,
    })

    return NextResponse.json(folder)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Folder PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; folderId: string }> }
) {
  const { projectId, folderId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    // Move attachments out of the folder (keep the files)
    await prisma.projectAttachment.updateMany({
      where: { folderId, projectId },
      data: { folderId: null },
    })

    await prisma.attachmentFolder.delete({ where: { id: folderId, projectId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Folder DELETE error:", error)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
