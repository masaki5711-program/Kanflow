"use client"

import { useEffect, useRef, useState } from "react"
import { SmilePlus } from "lucide-react"
import { cn, useToast } from "@/components/ui"
import { localizeApiError } from "@/hooks/api-client"
import { useLanguage } from "@/lib/language-context"
import { REACTION_EMOJIS, type ReactionEmoji, type ReactionTargetType } from "@/services/reactions/reactions.schemas"
import { reactionTitle } from "./reaction-utils"
import { useReactions } from "./use-reactions"

interface Props {
  projectId: string
  targetType: ReactionTargetType
  targetId: string
  className?: string
}

const CHIP = "inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-caption leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"

/**
 * Emoji reactions under a comment / chat message / completion comment: one
 * chip per emoji in use (click = add or take back your own) and a "+" button
 * that opens the palette. The "+" stays out of the way until the parent
 * (`group`) is hovered or focused, unless the viewer is on a touch screen.
 */
export function ReactionBar({ projectId, targetType, targetId, className }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const { reactions, toggle } = useReactions(projectId, targetType, targetId)
  const [open, setOpen] = useState(false)

  async function react(emoji: ReactionEmoji) {
    setOpen(false)
    try {
      await toggle(emoji)
    } catch (err) {
      toast.error(localizeApiError(err, t), { title: t.reactionFailed })
    }
  }

  return (
    <div role="group" aria-label={t.reactionGroupLabel} className={cn("mt-1 flex flex-wrap items-center gap-1", className)}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          aria-pressed={r.mine}
          aria-label={(r.mine ? t.reactionChipRemove : t.reactionChipAdd).replace("{emoji}", r.emoji).replace("{count}", String(r.count))}
          title={reactionTitle(r, (count) => t.reactionMore.replace("{count}", String(count)))}
          onClick={() => void react(r.emoji)}
          className={cn(CHIP, r.mine ? "border-primary/50 bg-primary-soft text-primary-strong" : "border-border bg-surface text-fg-muted hover:bg-surface-muted")}
        >
          <span aria-hidden="true">{r.emoji}</span>
          <span aria-hidden="true" className="font-medium tabular-nums">{r.count}</span>
        </button>
      ))}
      <Palette open={open} onOpenChange={setOpen} onPick={(e) => void react(e)} alwaysVisible={reactions.length > 0} />
    </div>
  )
}

function Palette({ open, onOpenChange, onPick, alwaysVisible }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (emoji: ReactionEmoji) => void; alwaysVisible: boolean }) {
  const { t } = useLanguage()
  const box = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const firstEmoji = useRef<HTMLButtonElement>(null)

  // Escape / a pick give focus back to the "+" button instead of losing it with the palette.
  useEffect(() => {
    if (open) firstEmoji.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onOpenChange])

  return (
    <span ref={box} className={cn("relative", !alwaysVisible && !open && "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100")}>
      <button
        ref={trigger}
        type="button"
        aria-label={t.reactionAdd}
        title={t.reactionAdd}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={cn(CHIP, "border-transparent text-fg-muted hover:bg-surface-muted focus-visible:opacity-100")}
      >
        <SmilePlus aria-hidden="true" className="h-4 w-4" />
      </button>
      {open && (
        <span role="group" aria-label={t.reactionAdd} className="absolute left-0 top-full z-20 mt-1 flex gap-0.5 rounded-ui-md border border-border bg-surface p-1 shadow-ui-md">
          {REACTION_EMOJIS.map((emoji, i) => (
            <button
              key={emoji}
              ref={i === 0 ? firstEmoji : undefined}
              type="button"
              aria-label={emoji}
              onClick={() => {
                onPick(emoji)
                trigger.current?.focus()
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-ui-sm text-lg hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
