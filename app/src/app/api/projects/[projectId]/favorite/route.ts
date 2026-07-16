import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectAccess } from "@/lib/api-helpers"

/**
 * Toggle the current user's favorite flag for the project.
 * POST   → favorite (idempotent)
 * DELETE → unfavorite
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const access = await requireProjectAccess(projectId, "read")
  if ("error" in access) return access.error

  const userId = access.session.user.id
  await prisma.userProjectFavorite.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId },
    update: {},
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const access = await requireProjectAccess(projectId, "read")
  if ("error" in access) return access.error

  const userId = access.session.user.id
  await prisma.userProjectFavorite
    .delete({ where: { userId_projectId: { userId, projectId } } })
    .catch(() => null)
  return NextResponse.json({ ok: true })
}
