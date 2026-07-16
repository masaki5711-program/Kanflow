import { NextResponse } from "next/server"
import { z } from "zod/v4"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  employeeNumber: z.string().max(50).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
})

function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

/** Return the current user's editable profile (excluding sensitive fields). */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      employeeNumber: true,
      department: true,
      role: true,
      language: true,
    },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(user)
}

/**
 * Self-service profile update. Lets the signed-in user change their own
 * display name, employee number and department. Email and role are
 * intentionally excluded — those require admin action.
 */
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "入力値が不正です" }, { status: 400 })
  }

  const employeeNumber = normalizeOptional(parsed.data.employeeNumber)
  const department = normalizeOptional(parsed.data.department)

  // employeeNumber must remain unique across all users.
  if (typeof employeeNumber === "string") {
    const dup = await prisma.user.findFirst({
      where: { employeeNumber, NOT: { id: session.user.id } },
      select: { id: true },
    })
    if (dup) {
      return NextResponse.json(
        { error: "この従業員番号は既に使用されています" },
        { status: 409 }
      )
    }
  }

  const updateData: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name
  if (employeeNumber !== undefined) updateData.employeeNumber = employeeNumber
  if (department !== undefined) updateData.department = department

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      employeeNumber: true,
      department: true,
      role: true,
      language: true,
    },
  })
  return NextResponse.json(user)
}
