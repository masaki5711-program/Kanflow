import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().nullable().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const maxOrder = await prisma.attachmentFolder.aggregate({
      where: { projectId, parentId: data.parentId ?? null },
      _max: { sortOrder: true },
    })

    const folder = await prisma.attachmentFolder.create({
      data: {
        projectId,
        name: data.name,
        parentId: data.parentId ?? null,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
      include: { attachments: true },
    })

    return NextResponse.json({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      sortOrder: folder.sortOrder,
      attachments: folder.attachments.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        folderId: a.folderId,
        createdAt: a.createdAt.toISOString(),
      })),
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Folder CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
