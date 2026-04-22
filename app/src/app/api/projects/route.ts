import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { copyTemplateFile, requireAuth } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  projectType: z.enum(["software", "process_improvement", "general"]).optional(),
})

const PRODUCT_GOAL_TEMPLATE = {
  fileName: "ProductGoalSheet.xlsx",
  displayName: "ProductGoalSheet.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)
    const projectType = data.projectType ?? "software"

    const user = await prisma.user.findUnique({
      where: { id: gate.session.user.id },
      select: { language: true },
    })
    const language = user?.language ?? "ja"

    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        projectType,
        language,
        members: {
          create: { userId: gate.session.user.id, role: "po" },
        },
      },
    })

    if (projectType === "software") {
      const copied = await copyTemplateFile(
        project.id,
        PRODUCT_GOAL_TEMPLATE.fileName,
        PRODUCT_GOAL_TEMPLATE.displayName,
        PRODUCT_GOAL_TEMPLATE.mimeType
      )
      if (copied.ok) {
        await prisma.projectAttachment.create({
          data: {
            projectId: project.id,
            folderId: null,
            fileName: copied.fileName,
            originalName: copied.originalName,
            fileSize: copied.fileSize,
            mimeType: copied.mimeType,
            uploadedBy: gate.session.user.name ?? null,
          },
        })
      } else {
        console.warn("Default template attach skipped:", copied.error)
      }
    }

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Project CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
