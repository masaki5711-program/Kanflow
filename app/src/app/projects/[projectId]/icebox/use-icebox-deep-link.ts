"use client"

import { useDeepLinkHighlight } from "@/hooks/use-deep-link-highlight"
import { useToast } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { ICEBOX_STATUSES, type IceboxItem, type IceboxLists } from "./types"

/** `id` of an item card (deep-link anchor). */
export function iceboxItemElementId(itemId: string): string {
  return `icebox-item-${itemId}`
}

export function findIceboxItem(lists: IceboxLists | null | undefined, itemId: string): IceboxItem | undefined {
  if (!lists) return undefined
  for (const status of ICEBOX_STATUSES) {
    const hit = (lists[status] ?? []).find((i) => i.id === itemId)
    if (hit) return hit
  }
  return undefined
}

interface Options {
  lists: IceboxLists | null | undefined
  isReady: boolean
  /** Clear the text search when it would hide the item. */
  clearSearch: () => void
}

/**
 * `?item=<itemId>` (search, notifications): scroll to the item card, focus and
 * highlight it. The item has no read-only detail view (only the edit form),
 * so the card itself is the destination.
 */
export function useIceboxDeepLink({ lists, isReady, clearSearch }: Options): void {
  const toast = useToast()
  const { t } = useLanguage()
  useDeepLinkHighlight("item", iceboxItemElementId, {
    isReady,
    reveal: (itemId) => {
      if (!findIceboxItem(lists, itemId)) return false
      clearSearch()
      return true
    },
    onNotFound: () => toast.info(t.iceboxDeepLinkNotFound),
  })
}
