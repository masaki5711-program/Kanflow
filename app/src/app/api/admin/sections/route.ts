import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/api-helpers"

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional(),
})

export async function GET() {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const sections = await prisma.section.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { users: true, projects: true, categories: true } },
    },
  })
  return NextResponse.json(sections)
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  let parsed
  try {
    parsed = createSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  try {
    const section = await prisma.section.create({
      data: {
        name: parsed.name,
        description: parsed.description ?? null,
        sortOrder: parsed.sortOrder ?? 0,
      },
    })
    return NextResponse.json(section, { status: 201 })
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "duplicate_name" }, { status: 409 })
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 })
  }
}
