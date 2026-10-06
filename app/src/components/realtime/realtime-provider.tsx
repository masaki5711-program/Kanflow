"use client"

import { createContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { createRealtimeConnection, type RealtimeConnection } from "./realtime-connection"
import { createRealtimeHub, projectIdFromPath, type RealtimeHub } from "./realtime-hub"

/** null outside the provider (isolated component tests): live hooks then do nothing. */
export const RealtimeContext = createContext<RealtimeHub | null>(null)

/**
 * Keeps ONE Server-Sent Events stream per tab while signed in, subscribed to
 * the project of the current route (`/projects/<id>/...`), and hands its
 * events to `useLiveRefetch` hooks. Mounted once inside SessionProvider.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const projectId = projectIdFromPath(usePathname())
  const [hub] = useState(createRealtimeHub)
  const connectionRef = useRef<RealtimeConnection | null>(null)
  const projectRef = useRef(projectId)
  useEffect(() => {
    projectRef.current = projectId
    connectionRef.current?.setProject(projectId)
  }, [projectId])

  useEffect(() => {
    if (status !== "authenticated") return
    const connection = createRealtimeConnection(hub)
    connectionRef.current = connection
    connection.start(projectRef.current)
    return () => {
      connection.stop()
      connectionRef.current = null
    }
  }, [status, hub])

  return <RealtimeContext.Provider value={hub}>{children}</RealtimeContext.Provider>
}
