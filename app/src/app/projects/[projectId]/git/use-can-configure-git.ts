"use client"

import { useSession } from "next-auth/react"
import { useApiQuery } from "@/hooks"

interface MemberRow {
  role: string
  user: { id: string }
}

/** "git.configure" on the client: a system admin, or the project's PO / SM (the server enforces it again). */
export function useCanConfigureGit(projectId: string): boolean {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const isAdmin = session?.user?.role === "admin"
  const { data: members } = useApiQuery<MemberRow[]>(isAdmin || !userId ? null : `/api/projects/${projectId}/members`, {
    parse: (raw) => (Array.isArray(raw) ? (raw as MemberRow[]) : []),
  })
  if (isAdmin) return true
  const role = members?.find((m) => m.user?.id === userId)?.role
  return role === "po" || role === "sm"
}
