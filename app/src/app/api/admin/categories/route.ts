import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/api-helpers"

const createSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
  /** Null = global category visible to everyone. */
  sectionId: z.string().nullable().optional(),
})

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const sectionParam = url.searchParams.get("sectionId")
  // sectionId=null query param means global only; absent means all
  const where =
    sectionParam === null
      ? {}
      : sectionParam === ""
      ? { sectionId: null }
      : { sectionId: sectionParam }

  const categories = await prisma.adminCategory.findMany({
    where,
    orderBy: [{ sectionId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      section: { select: { id: true, name: true } },
      _count: { select: { assignments: true } },
    },
  })
  return NextResponse.json(categories)
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
    const cat = await prisma.adminCategory.create({
      data: {
        name: parsed.name,
        color: parsed.color ?? "gray",
        sortOrder: parsed.sortOrder ?? 0,
        sectionId: parsed.sectionId ?? null,
      },
    })
    return NextResponse.json(cat, { status: 201 })
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "duplicate_name_in_scope" }, { status: 409 })
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 })
  }
}
