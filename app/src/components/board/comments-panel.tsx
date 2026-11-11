"use client"

import { useMemo, useState } from "react"
import { Check, Crosshair, RotateCcw, Trash2, X } from "lucide-react"
import { CommentComposer } from "@/components/comments/comment-composer"
import { useMentionMembersState, withoutUser } from "@/components/comments/use-comment-thread"
import type { ElementMap } from "@/lib/board/geometry"
import { mentionsToPlainText } from "@/lib/mentions"
import { useLanguage } from "@/lib/language-context"
import { Button, cn, useToast } from "@/components/ui"
import { describeElement } from "./describe"
import type { BoardCommentItem } from "./use-board-collab"

interface CommentsPanelProps {
  projectId: string
  sheetId: string
  elements: ElementMap
  comments: BoardCommentItem[]
  /** What a new comment is about: the one selected element, or the sheet. */
  target: string | null
  userId: string | null
  canWrite: boolean
  canManage: boolean
  add: (input: { sheetId: string; elementId: string | null; body: string }) => Promise<void>
  resolve: (id: string, resolved: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Selects the element and brings it into view. */
  show: (elementId: string) => void
  onClose: () => void
}

/** The sheet's comments beside the canvas: per element or the sheet, @mentions notify, resolve / reopen, delete. */
export function CommentsPanel({ projectId, sheetId, elements, comments, target, userId, canWrite, canManage, add, resolve, remove, show, onClose }: CommentsPanelProps) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const { members, isLoading } = useMentionMembersState(projectId)
  const [showResolved, setShowResolved] = useState(false)
  const mine = useMemo(() => comments.filter((c) => c.sheetId === sheetId && (showResolved || !c.resolved)), [comments, sheetId, showResolved])
  const name = (elementId: string | null) => {
    if (!elementId) return t.wbCommentOnSheet
    const el = elements[elementId]
    return el ? t.wbCommentOn.replace("{target}", describeElement(el, elements, t).slice(0, 60)) : t.wbCommentOnSheet
  }
  const when = (iso: string) => new Date(iso).toLocaleString(language === "id" ? "id-ID" : language === "en" ? "en-GB" : "ja-JP", { dateStyle: "short", timeStyle: "short" })

  async function run(action: () => Promise<void>) {
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t.wbCommentFailed)
    }
  }

  return (
    <aside aria-label={t.wbComments} className="flex w-80 max-w-[85vw] shrink-0 flex-col border-l border-border bg-surface" data-testid="board-comments">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-body font-semibold text-fg">{t.wbCommentsCount.replace("{n}", String(mine.filter((c) => !c.resolved).length))}</h2>
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-1 text-caption text-fg-muted">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            {t.wbCommentShowResolved}
          </label>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t.wbHistoryClose}>
            <X aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {mine.length === 0 && <li className="text-caption text-fg-muted">{t.wbCommentsEmpty}</li>}
        {mine.map((c) => (
          <li key={c.id} className={cn("rounded-ui-md border border-border p-2", c.resolved && "opacity-60")} data-comment-id={c.id}>
            <p className="truncate text-caption font-medium text-fg-muted">{name(c.elementId)}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-body text-fg">{mentionsToPlainText(c.body)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-caption text-fg-muted">
              <span className="mr-auto">
                {c.author.name || "—"} · {when(c.createdAt)}
              </span>
              {c.elementId && elements[c.elementId] && (
                <Button variant="ghost" size="sm" onClick={() => show(c.elementId as string)} aria-label={t.wbCommentShow} title={t.wbCommentShow}>
                  <Crosshair aria-hidden className="h-4 w-4" />
                </Button>
              )}
              {canWrite && (
                <Button variant="ghost" size="sm" onClick={() => void run(() => resolve(c.id, !c.resolved))} aria-label={c.resolved ? t.wbCommentReopen : t.wbCommentResolve} title={c.resolved ? t.wbCommentReopen : t.wbCommentResolve}>
                  {c.resolved ? <RotateCcw aria-hidden className="h-4 w-4" /> : <Check aria-hidden className="h-4 w-4" />}
                </Button>
              )}
              {canWrite && (c.author.id === userId || canManage) && (
                <Button variant="ghost" size="sm" onClick={() => void run(() => remove(c.id))} aria-label={t.wbCommentDelete} title={t.wbCommentDelete}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {canWrite && (
        <div className="border-t border-border p-3">
          <p className="mb-1 truncate text-caption text-fg-muted">{name(target)}</p>
          <CommentComposer
            members={withoutUser(members, userId)}
            membersLoading={isLoading}
            label={t.wbCommentLabel}
            submitLabel={t.wbCommentSend}
            onSubmit={async (body) => {
              try {
                await add({ sheetId, elementId: target, body })
                return true
              } catch (error) {
                toast.error(error instanceof Error && error.message ? error.message : t.wbCommentFailed)
                return false
              }
            }}
          />
        </div>
      )}
    </aside>
  )
}
