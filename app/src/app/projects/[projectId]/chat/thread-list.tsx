"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { Button, Input, SkeletonLines, cn, useOptionalConfirm } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { threadUrl, threadsUrl, toThreadPage, type ChatThreadSummary } from "./chat-history"

interface ThreadListProps {
  projectId: string
  activeThreadId: string | null
  /** Bump to reload the list (a question was stored, a thread was created). */
  refreshKey: number
  onSelect: (threadId: string) => void
  onNew: () => void
  /** A thread was deleted (the page leaves it when it is the open one). */
  onDeleted: (threadId: string) => void
}

/** The caller's stored chats in this project, most recently active first (P3 chat history). */
export function ThreadList({ projectId, activeThreadId, refreshKey, onSelect, onNew, onDeleted }: ThreadListProps) {
  const { t, language } = useLanguage()
  const confirm = useOptionalConfirm()
  const first = useApiQuery(threadsUrl(projectId), { parse: toThreadPage, toastOnError: () => t.chatThreadsLoadFailed })
  const [more, setMore] = useState<{ items: ChatThreadSummary[]; nextCursor: string | null } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const { refetch, mutate } = first

  // Reload from the first page whenever the page reports a change.
  useEffect(() => {
    if (refreshKey === 0) return
    setMore(null)
    refetch()
  }, [refreshKey, refetch])

  const items = [...(first.data?.items ?? []), ...(more?.items ?? [])]
  const nextCursor = more ? more.nextCursor : (first.data?.nextCursor ?? null)

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = toThreadPage(await apiFetch(`${threadsUrl(projectId)}?cursor=${encodeURIComponent(nextCursor)}`))
      setMore((prev) => ({ items: [...(prev?.items ?? []), ...page.items], nextCursor: page.nextCursor }))
    } catch {
      // apiFetch errors are shown by the retry below; keep what is listed
    } finally {
      setLoadingMore(false)
    }
  }

  /** Replace one thread in whichever page holds it (immutable). */
  function patchLocal(id: string, patch: Partial<ChatThreadSummary> | null) {
    const apply = (list: ChatThreadSummary[]) =>
      patch === null ? list.filter((x) => x.id !== id) : list.map((x) => (x.id === id ? { ...x, ...patch } : x))
    mutate((cur) => (cur ? { ...cur, items: apply(cur.items) } : cur))
    setMore((cur) => (cur ? { ...cur, items: apply(cur.items) } : cur))
  }

  const rename = useApiMutation(
    ({ id, title }: { id: string; title: string }) =>
      apiFetch<ChatThreadSummary>(threadUrl(projectId, id), { method: "PATCH", json: { title } }),
    { onSuccess: (updated) => patchLocal(updated.id, { title: updated.title }), toastOnError: () => t.chatThreadActionFailed },
  )
  const remove = useApiMutation((id: string) => apiFetch(threadUrl(projectId, id), { method: "DELETE" }), {
    onSuccess: (_r, id) => {
      patchLocal(id, null)
      onDeleted(id)
    },
    toastOnError: () => t.chatThreadActionFailed,
  })

  async function askDelete(thread: ChatThreadSummary) {
    const message = fillTemplate(t.chatThreadDeleteConfirm, { title: thread.title })
    const ok = confirm
      ? await confirm({ title: t.chatThreadDeleteTitle, message, confirmLabel: t.chatThreadDelete, variant: "danger" })
      : window.confirm(message)
    if (ok) void remove.mutate(thread.id)
  }

  const locale = language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US"

  return (
    <nav aria-label={t.chatThreadsTitle} className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-body font-semibold text-fg">{t.chatThreadsTitle}</h2>
        <Button size="sm" variant="secondary" onClick={onNew} leftIcon={<Plus className="h-3.5 w-3.5" />}>
          {t.chatNewChat}
        </Button>
      </div>
      <p className="mb-2 text-caption text-fg-muted">{t.chatThreadsPrivate}</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {first.isLoading ? (
          <SkeletonLines lines={4} label={t.loading} />
        ) : first.error && items.length === 0 ? (
          <div className="space-y-2">
            <p className="text-caption text-danger">{t.chatThreadsLoadFailed}</p>
            <Button size="sm" variant="ghost" onClick={refetch}>
              {t.errorRetry}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="text-caption text-fg-muted">{t.chatThreadsEmpty}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((thread) => (
              <li key={thread.id}>
                {renamingId === thread.id ? (
                  <RenameForm
                    initial={thread.title}
                    onCancel={() => setRenamingId(null)}
                    onSave={(title) => {
                      setRenamingId(null)
                      if (title !== thread.title) void rename.mutate({ id: thread.id, title })
                    }}
                  />
                ) : (
                  <ThreadRow
                    thread={thread}
                    active={thread.id === activeThreadId}
                    locale={locale}
                    onSelect={() => onSelect(thread.id)}
                    onRename={() => setRenamingId(thread.id)}
                    onDelete={() => void askDelete(thread)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {nextCursor && (
          <Button size="sm" variant="ghost" className="mt-2 w-full" loading={loadingMore} onClick={() => void loadMore()}>
            {t.chatThreadsMore}
          </Button>
        )}
      </div>
    </nav>
  )
}

interface ThreadRowProps {
  thread: ChatThreadSummary
  active: boolean
  locale: string
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
}

function ThreadRow({ thread, active, locale, onSelect, onRename, onDelete }: ThreadRowProps) {
  const { t } = useLanguage()
  const title = thread.title || t.chatThreadUntitled
  const actionsLabel = fillTemplate(t.chatThreadActions, { title })
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-ui-sm border border-transparent",
        active ? "border-primary/40 bg-primary-soft" : "hover:bg-surface-muted",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        className="min-w-0 flex-1 px-2 py-1.5 text-left"
      >
        <span className="block truncate text-body text-fg">{title}</span>
        <span className="block text-caption text-fg-muted">
          {new Date(thread.updatedAt).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </button>
      <div role="group" aria-label={actionsLabel} className="flex shrink-0 items-center pr-1">
        <button
          type="button"
          onClick={onRename}
          aria-label={`${t.chatThreadRename}: ${title}`}
          className="rounded-ui-sm p-1.5 text-fg-muted hover:bg-surface-sunken hover:text-fg"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${t.chatThreadDelete}: ${title}`}
          className="rounded-ui-sm p-1.5 text-fg-muted hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function RenameForm({ initial, onSave, onCancel }: { initial: string; onSave: (title: string) => void; onCancel: () => void }) {
  const { t } = useLanguage()
  const [value, setValue] = useState(initial)
  const trimmed = value.trim()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (trimmed) onSave(trimmed)
  }

  return (
    <form onSubmit={submit} className="space-y-1 rounded-ui-sm border border-border p-2">
      <label className="sr-only" htmlFor="chat-thread-rename">
        {t.chatThreadRenameLabel}
      </label>
      <Input
        id="chat-thread-rename"
        value={value}
        maxLength={200}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel()
        }}
      />
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t.chatThreadCancel}
        </Button>
        <Button type="submit" size="sm" disabled={!trimmed}>
          {t.chatThreadSave}
        </Button>
      </div>
    </form>
  )
}
