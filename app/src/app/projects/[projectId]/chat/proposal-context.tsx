"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { useApiQuery } from "@/hooks"
import { can, type ProjectAction, type ProjectActor } from "@/lib/authz/policy"

/**
 * Page-level state of the proposal cards: what happened to each proposal
 * (keyed by the stable proposalId, so a repeated proposal shares its state)
 * and what the current user may approve.
 *
 * Permissions are resolved lazily by <ProposalPermissionsLoader>, which the
 * page mounts only once a proposal arrives — plain chats never fetch the
 * member list.
 */

export type ProposalState =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "applied"; href: string }
  | { status: "rejected" }

/** null while loading; otherwise the policy check for the current user. */
export type ProposalPermissions = ((action: ProjectAction) => boolean) | null

interface ProposalContextValue {
  stateOf: (proposalId: string) => ProposalState
  setState: (proposalId: string, state: ProposalState) => void
  permissions: ProposalPermissions
  setPermissions: (p: ProposalPermissions) => void
}

const IDLE: ProposalState = { status: "idle" }

const ProposalContext = createContext<ProposalContextValue | null>(null)

export function ProposalProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Readonly<Record<string, ProposalState>>>({})
  const [permissions, setPermissionsState] = useState<ProposalPermissions>(null)
  const setState = useCallback((id: string, state: ProposalState) => {
    setStates((prev) => ({ ...prev, [id]: state }))
  }, [])
  // Functions in state need the updater form.
  const setPermissions = useCallback((p: ProposalPermissions) => setPermissionsState(() => p), [])
  const value = useMemo<ProposalContextValue>(
    () => ({ stateOf: (id) => states[id] ?? IDLE, setState, permissions, setPermissions }),
    [states, setState, permissions, setPermissions],
  )
  return <ProposalContext.Provider value={value}>{children}</ProposalContext.Provider>
}

export function useProposalContext(): ProposalContextValue {
  const ctx = useContext(ProposalContext)
  if (!ctx) throw new Error("useProposalContext must be used within ProposalProvider")
  return ctx
}

interface MemberRow {
  role: string
  user: { id: string }
}

/** Resolves the current user's permissions into the context (render once per page). */
export function ProposalPermissionsLoader({ projectId }: { projectId: string }) {
  const { setPermissions } = useProposalContext()
  const { data: session } = useSession()
  const userId = session?.user?.id ?? null
  const systemRole = (session?.user as { role?: string } | undefined)?.role ?? "member"
  const isAdmin = systemRole === "admin"
  // Admins bypass membership; everyone else needs their project role.
  const members = useApiQuery<MemberRow[]>(isAdmin || !userId ? null : `/api/projects/${projectId}/members`)
  const ready = !!userId && (isAdmin || members.data !== undefined || members.error !== null)
  const projectRole = members.data?.find((m) => m.user.id === userId)?.role ?? null

  useEffect(() => {
    if (!ready || !userId) return
    // Section-manager access is not visible to the client, so it counts as
    // absent here (a UI hint only — the API route decides).
    const actor: ProjectActor = { userId, systemRole, projectRole, isSectionManagerOfProject: false }
    setPermissions((action: ProjectAction) => can(actor, action))
  }, [ready, userId, systemRole, projectRole, setPermissions])

  return null
}
