import path from "path"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

/**
 * Verify that a resolved file path stays within the uploads directory.
 * Prevents path traversal attacks.
 */
export function safeFilePath(projectId: string, fileName: string): string | null {
  const uploadDir = path.join(process.cwd(), "private", "uploads")
  const resolved = path.resolve(uploadDir, projectId, fileName)
  if (!resolved.startsWith(uploadDir + path.sep)) {
    return null
  }
  return resolved
}

/**
 * Validate that a file extension contains only safe characters.
 */
export function safeExtension(rawExt: string): string {
  return /^\.[a-zA-Z0-9]+$/.test(rawExt) ? rawExt : ""
}

/**
 * Authenticate session and verify project membership.
 * Returns { session, member } on success or a NextResponse error.
 */
export async function requireProjectMember(
  projectId: string,
  options?: { roles?: string[] }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const where: Record<string, unknown> = {
    projectId,
    userId: session.user.id,
  }
  if (options?.roles) {
    where.role = { in: options.roles }
  }

  const member = await prisma.projectMember.findFirst({ where })
  if (!member) {
    return {
      error: NextResponse.json(
        { error: options?.roles ? "権限がありません" : "メンバーではありません" },
        { status: 403 }
      ),
    }
  }

  return { session, member }
}

/**
 * Authenticate session only (no membership check).
 */
export async function requireAuth() {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { session }
}

/**
 * Authenticate session and verify admin role.
 */
export async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }) }
  }
  return { session }
}
