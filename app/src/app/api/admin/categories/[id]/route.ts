import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/api-helpers"

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
  sectionId: z.string().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { id } = await params
  let parsed
  try {
    parsed = updateSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  try {
    const cat = await prisma.adminCategory.update({ where: { id }, data: parsed })
    return NextResponse.json(cat)
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "duplicate_name_in_scope" }, { status: 409 })
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { id } = await params
  try {
    await prisma.adminCategory.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
}
