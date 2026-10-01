"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Badge, Button, EmptyState, Input, Modal, SkeletonLines } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { edgesOf, pickBlocks, refLabel, type PickBlock, type PickMode } from "@/lib/pbi-dependencies"
import type { BacklogItemDto, BacklogListResponse } from "@/types/api"

interface Props {
  projectId: string
  /** The PBI the dependency is added to. */
  self: { id: string; label: string }
  /** "blockedBy": the pick must finish before `self`; "blocking": the pick starts after `self`. */
  mode: PickMode
  onPick: (pbiId: string) => void
  onClose: () => void
}

/**
 * Searchable PBI list for a new dependency. PBIs that cannot be picked (the
 * PBI itself, an existing link, a cycle) stay listed but disabled with the
 * reason, so the server never has to reject a pick.
 */
export function PbiDependencyPicker({ projectId, self, mode, onPick, onClose }: Props) {
  const { t, language } = useLanguage()
  const [q, setQ] = useState("")
  const list = useApiQuery<BacklogListResponse<BacklogItemDto>>(`/api/projects/${projectId}/backlog`, { toastOnError: true })
  const all = useMemo(() => {
    const d = list.data
    return d ? [...d.readyItems, ...d.notReadyItems, ...(d.completedItems ?? [])] : []
  }, [list.data])
  const blocks = useMemo(() => pickBlocks(edgesOf(all), self.id, mode), [all, self.id, mode])
  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((i) => blocks.get(i.id) !== "self")
      .map((i) => ({ item: i, label: refLabel(i, language) }))
      .filter((c) => !needle || c.label.toLowerCase().includes(needle))
  }, [all, blocks, language, q])
  const reason: Record<Exclude<PickBlock, "self">, string> = { cycle: t.depPickBlockedCycle, existing: t.depPickBlockedExisting }
  const statusLabel: Record<string, string> = {
    ready: t.backlogStatusReady,
    not_ready: t.backlogStatusNotReady,
    completed: t.backlogStatusCompleted,
  }
  const isBlockedBy = mode === "blockedBy"

  return (
    <Modal
      open
      onClose={onClose}
      closeOnOverlayClick
      size="md"
      title={isBlockedBy ? t.depPickBlockedByTitle : t.depPickBlockingTitle}
      description={(isBlockedBy ? t.depPickBlockedByDesc : t.depPickBlockingDesc).replace("{name}", self.label)}
      footer={<Button variant="secondary" onClick={onClose}>{t.cancel}</Button>}
    >
      <label className="relative mb-3 block">
        <span className="sr-only">{t.depPickSearch}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input type="search" value={q} placeholder={t.depPickSearch} onChange={(e) => setQ(e.target.value)} className="pl-8" data-autofocus />
      </label>
      {list.isLoading ? (
        <SkeletonLines lines={5} label={t.loading} />
      ) : candidates.length === 0 ? (
        <EmptyState compact title={t.depPickNoMatches} />
      ) : (
        <ul className="space-y-0.5">
          {candidates.map(({ item, label }) => {
            const block = blocks.get(item.id)
            const why = block && block !== "self" ? reason[block] : null
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!!why}
                  data-pbi-pick={item.id}
                  data-pbi-blocked={block}
                  onClick={() => onPick(item.id)}
                  className="flex min-h-10 w-full items-center gap-2 rounded-ui-sm px-2 text-left text-body text-fg hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {why ? (
                    <span className="shrink-0 text-caption text-fg-muted">{why}</span>
                  ) : (
                    <Badge tone={item.status === "completed" ? "success" : item.status === "ready" ? "primary" : "warning"} size="sm">
                      {statusLabel[item.status] ?? item.status}
                    </Badge>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
