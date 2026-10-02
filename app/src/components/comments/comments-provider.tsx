"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { CommentCountButton, CommentsDialog } from "./comments-dialog"
import { commentsDeepLinkTarget, withoutTabParam } from "./comments-deep-link"
import { useCommentCounts } from "./use-comment-thread"
import type { CommentEntityType } from "./types"

/** The counts endpoint takes at most this many ids; later items just show no badge. */
const MAX_COUNT_IDS = 200

interface CommentsContextValue {
  counts: Record<string, number>
  /** The viewer's unread mentions / comments per item. */
  unread: Record<string, number>
  open: (entityId: string, name: string) => void
  /** Item whose comments the URL asks to open (`?task=<id>&tab=comments`), until its button claims it. */
  autoOpenId: string | null
  claimAutoOpen: (entityId: string, name: string) => void
}

const CommentsContext = createContext<CommentsContextValue | null>(null)

interface ProviderProps {
  projectId: string
  entityType: CommentEntityType
  /** Items listed under this provider (one counts request for all of them). */
  entityIds: readonly string[]
  children: ReactNode
}

/** Read once on mount: the deep link's target (the item's page deep-link hook removes `?task=` later). */
function initialTarget(entityType: CommentEntityType): string | null {
  return typeof window === "undefined" ? null : commentsDeepLinkTarget(window.location.search, entityType)
}

/**
 * Comment counts (one request per list) and the comment dialog for a list of
 * items (a sprint card's tasks, an IceBox section). Rows render
 * `CommentsButton`, which reads this context. A `&tab=comments` deep link
 * (mention / comment notifications) opens the item's thread once its button renders.
 */
export function CommentsProvider({ projectId, entityType, entityIds, children }: ProviderProps) {
  const ids = useMemo(() => entityIds.slice(0, MAX_COUNT_IDS), [entityIds])
  const { counts, unread, adjustCount, clearUnread } = useCommentCounts(projectId, entityType, ids)
  const [openItem, setOpenItem] = useState<{ id: string; name: string } | null>(null)
  const [autoOpenId, setAutoOpenId] = useState<string | null>(() => initialTarget(entityType))
  const open = useCallback((id: string, name: string) => setOpenItem({ id, name }), [])
  const claimAutoOpen = useCallback((id: string, name: string) => {
    setAutoOpenId(null)
    setOpenItem({ id, name })
    // Drop `?tab=` so a reload does not open the thread again.
    const { pathname, search, hash } = window.location
    window.history.replaceState(window.history.state, "", `${pathname}${withoutTabParam(search)}${hash}`)
  }, [])
  const value = useMemo(() => ({ counts, unread, open, autoOpenId, claimAutoOpen }), [counts, unread, open, autoOpenId, claimAutoOpen])

  return (
    <CommentsContext.Provider value={value}>
      {children}
      {openItem && (
        <CommentsDialog projectId={projectId} entityType={entityType} entityId={openItem.id} name={openItem.name}
          onClose={() => setOpenItem(null)} onCountDelta={(d) => adjustCount(openItem.id, d)} onRead={() => clearUnread(openItem.id)} />
      )}
    </CommentsContext.Provider>
  )
}

/** Comment button with count for one item (renders nothing outside a provider). */
export function CommentsButton({ entityId, name, className }: { entityId: string; name: string; className?: string }) {
  const ctx = useContext(CommentsContext)
  const shouldAutoOpen = !!ctx && ctx.autoOpenId === entityId
  const claim = ctx?.claimAutoOpen
  useEffect(() => {
    if (shouldAutoOpen && claim) claim(entityId, name)
  }, [shouldAutoOpen, claim, entityId, name])
  if (!ctx) return null
  return <CommentCountButton name={name} count={ctx.counts[entityId]} unread={ctx.unread[entityId]} onClick={() => ctx.open(entityId, name)} className={className} />
}
