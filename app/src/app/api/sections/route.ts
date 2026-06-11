import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"

export async function GET() {
  const auth = await requireAuth()
  if ("error" in auth) return auth.error

  const sections = await prisma.section.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  })
  return NextResponse.json(sections)
}
