import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  projectType: z.enum(["software", "process_improvement", "general"]).optional(),
})

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        projectType: data.projectType ?? "software",
        members: {
          create: { userId: gate.session.user.id, role: "po" },
        },
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Project CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
