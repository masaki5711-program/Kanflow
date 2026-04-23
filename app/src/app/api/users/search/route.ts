import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"

export async function GET(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  const excludeProjectId = searchParams.get("excludeProjectId") ?? undefined

  if (q.length < 1) {
    return NextResponse.json([])
  }

  const whereOr = [
    { name: { contains: q } },
    { email: { contains: q } },
    { employeeNumber: { contains: q } },
    { department: { contains: q } },
  ]

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: whereOr,
    },
    select: {
      id: true,
      name: true,
      email: true,
      employeeNumber: true,
      department: true,
      memberships: excludeProjectId
        ? {
            where: { projectId: excludeProjectId },
            select: { id: true },
          }
        : false,
    },
    orderBy: [{ name: "asc" }],
    take: 20,
  })

  const result = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    employeeNumber: u.employeeNumber,
    department: u.department,
    isMember: excludeProjectId ? (u.memberships?.length ?? 0) > 0 : false,
  }))

  return NextResponse.json(result)
}
