"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import type { Announce } from "../improvement/section-frame"
import { BudgetSection } from "./budget-section"
import { ChecksSection } from "./checks-section"
import { DocumentsSection } from "./documents-section"
import { checkLabel, visibleTabs, type MilestoneBoard, type TabKey } from "./milestone-types"
import { PunchSection } from "./punch-section"
import type { PunchRowContext } from "./punch-row"
import { TrendSection } from "./trend-section"
import type { BoardWriter } from "./use-milestone-board"

interface Props {
  projectId: string
  board: MilestoneBoard
  stageNames: ReadonlyMap<string, string>
  stageOptions: ReadonlyArray<{ id: string; label: string }>
  punchCtx: Omit<PunchRowContext, "announce">
  write: BoardWriter
}

const SUCCESS_VISIBLE_MS = 4000

/**
 * The parts below the stage track as an ARIA tablist (arrow keys / Home /
 * End move between tabs): チェック項目 (named by the board), 残課題, 引き渡し資料,
 * 予算 (when on) and 推移 (when on or a metric exists). One aria-live line
 * announces every save.
 */
export function BoardTabs({ projectId, board, stageNames, stageOptions, punchCtx, write }: Props) {
  const { t } = useLanguage()
  const tabs = visibleTabs(board)
  const [active, setActive] = useState<TabKey>("checks")
  const current = tabs.includes(active) ? active : "checks"
  const refs = useRef(new Map<TabKey, HTMLButtonElement>())
  const [status, setStatus] = useState<{ message: string; tone: "success" | "error" } | null>(null)
  const announce: Announce = useCallback((message, tone = "success") => setStatus({ message, tone }), [])
  useEffect(() => {
    if (status?.tone !== "success") return
    const timer = setTimeout(() => setStatus(null), SUCCESS_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [status])

  const labels: Record<TabKey, string> = {
    checks: `${checkLabel(board, t)} ${board.summary.checks.passed}/${board.summary.checks.total}`,
    punch: `${t.msTabPunch} ${board.summary.punch.open}`,
    docs: `${t.msTabDocs} ${board.summary.documents.received}/${board.summary.documents.total}`,
    budget: t.msTabBudget,
    trend: t.msTabTrend,
  }

  function onKey(e: KeyboardEvent) {
    const i = tabs.indexOf(current)
    const next = { ArrowRight: tabs[(i + 1) % tabs.length], ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length], Home: tabs[0], End: tabs[tabs.length - 1] }[e.key]
    if (!next) return
    e.preventDefault()
    setActive(next)
    refs.current.get(next)?.focus()
  }

  return (
    <section className="rounded-ui-lg border border-border bg-surface shadow-ui-sm">
      <div role="tablist" aria-label={t.msTabsLabel} className="flex gap-1 overflow-x-auto border-b border-border px-2 pt-2" onKeyDown={onKey}>
        {tabs.map((k) => (
          <button
            key={k}
            ref={(el) => {
              if (el) refs.current.set(k, el)
            }}
            type="button"
            role="tab"
            id={`ms-tab-${k}`}
            aria-selected={current === k}
            aria-controls={`ms-panel-${k}`}
            tabIndex={current === k ? 0 : -1}
            onClick={() => setActive(k)}
            className={cn(
              "min-h-11 shrink-0 whitespace-nowrap rounded-t-ui-md border-b-2 px-3 text-body font-medium transition-colors",
              current === k ? "border-primary text-primary-strong" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {labels[k]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`ms-panel-${current}`} aria-labelledby={`ms-tab-${current}`} className="p-3 sm:p-4">
        {current === "checks" && <ChecksSection board={board} stageNames={stageNames} stageOptions={stageOptions} write={write} announce={announce} />}
        {current === "punch" && <PunchSection items={board.punchItems} ctx={{ ...punchCtx, announce }} viewerId={board.viewerId} />}
        {current === "docs" && <DocumentsSection board={board} projectId={projectId} write={write} announce={announce} />}
        {current === "budget" && <BudgetSection board={board} write={write} announce={announce} />}
        {current === "trend" && <TrendSection board={board} write={write} announce={announce} />}
      </div>
      <p
        aria-live="polite"
        aria-atomic="true"
        className={status ? `sticky bottom-2 mx-3 mb-3 rounded-ui-md px-3 py-2 text-body font-medium shadow-ui-md ${status.tone === "error" ? "bg-danger-soft text-danger-strong" : "bg-success-soft text-success-strong"}` : "sr-only"}
      >
        {status?.message ?? ""}
      </p>
    </section>
  )
}
