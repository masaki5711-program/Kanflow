"use client"

import { ArrowRightFromLine, CircleCheck, Hourglass } from "lucide-react"
import { cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { openBlocking, refLabel, waitingOn } from "@/lib/pbi-dependencies"
import type { PbiDependencyRefDto } from "@/types/api"

interface WithDeps {
  id: string
  blockedBy?: readonly PbiDependencyRefDto[]
  blocking?: readonly PbiDependencyRefDto[]
}

const CHIP = "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-caption"

/** "Waiting for #12 (and n more)": the PBI cannot start yet. Null when nothing is open. */
export function PbiWaitingChip({ item, onOpenRef, className }: { item: WithDeps; onOpenRef?: (ref: PbiDependencyRefDto) => void; className?: string }) {
  const { t, language } = useLanguage()
  const waiting = waitingOn(item)
  if (waiting.length === 0) return null
  const [first] = waiting
  const text =
    waiting.length === 1
      ? t.depChipWaitingOne.replace("{id}", String(first.displayId))
      : t.depChipWaitingMany.replace("{id}", String(first.displayId)).replace("{n}", String(waiting.length - 1))
  const title = t.depChipWaitingTitle.replace("{list}", waiting.map((r) => refLabel(r, language)).join(" / "))
  const cls = cn(CHIP, "border border-warning/40 bg-warning-soft font-medium text-warning-strong", className)
  const body = (
    <>
      <Hourglass aria-hidden="true" className="h-3 w-3 shrink-0" />
      <span className="truncate">{text}</span>
    </>
  )
  if (!onOpenRef) {
    return (
      <span className={cls} title={title} data-pbi-waiting="">
        {body}
      </span>
    )
  }
  return (
    <button type="button" className={cn(cls, "hover:underline")} title={title} aria-label={title} data-pbi-waiting="" onClick={() => onOpenRef(first)}>
      {body}
    </button>
  )
}

/**
 * Dependency chips of a backlog card: waiting (amber, opens the first open
 * predecessor), prerequisites done (green) and how many PBIs wait for this one.
 */
export function PbiDependencyChips({ item, onOpenRef }: { item: WithDeps; onOpenRef?: (ref: PbiDependencyRefDto) => void }) {
  const { t, language } = useLanguage()
  const blockedBy = item.blockedBy ?? []
  const waiting = waitingOn(item)
  const blocking = openBlocking(item)
  const list = (refs: readonly PbiDependencyRefDto[]) => refs.map((r) => refLabel(r, language)).join(" / ")
  return (
    <>
      <PbiWaitingChip item={item} onOpenRef={onOpenRef} />
      {blockedBy.length > 0 && waiting.length === 0 && (
        <span className={cn(CHIP, "bg-success-soft text-success-strong")} title={t.depChipReadyTitle.replace("{list}", list(blockedBy))} data-pbi-deps-done="">
          <CircleCheck aria-hidden="true" className="h-3 w-3 shrink-0" />
          {t.depChipReady}
        </span>
      )}
      {blocking.length > 0 && (
        <span className={cn(CHIP, "bg-surface-sunken text-fg-muted")} title={t.depChipBlockingTitle.replace("{list}", list(blocking))} data-pbi-blocking="">
          <ArrowRightFromLine aria-hidden="true" className="h-3 w-3 shrink-0" />
          {t.depChipBlocking.replace("{n}", String(blocking.length))}
        </span>
      )}
    </>
  )
}
