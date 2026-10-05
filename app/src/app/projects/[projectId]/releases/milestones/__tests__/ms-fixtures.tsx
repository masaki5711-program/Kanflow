/**
 * Fixtures for the マイルストーン・検収ボード component tests (not a test
 * file itself): a general-project LanguageProvider and board builders.
 */
import type { ReactElement, ReactNode } from "react"
import { render } from "@testing-library/react"
import { ConfirmProvider, ToastProvider } from "@/components/ui"
import { LanguageProvider } from "@/lib/language-context"
import { summarizeBoard } from "@/lib/milestones/summary"
import type { MilestoneBoard, PunchItem, Stage } from "../milestone-types"

export const TODAY = "2026-10-02"

export function GeneralProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider initialLanguage="ja" initialProjectType="general">
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </LanguageProvider>
  )
}

export function renderGeneral(ui: ReactElement) {
  return render(<GeneralProviders>{ui}</GeneralProviders>)
}

export function stage(over: Partial<Stage> = {}): Stage {
  return {
    id: "s1",
    name: "仕様決定",
    i18n: {},
    status: "not_started",
    scheduleState: "not_started",
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    isMilestone: false,
    progressPct: 0,
    hasChildren: false,
    version: 1,
    notes: null,
    conditions: [],
    steps: [],
    ...over,
  }
}

export function punch(over: Partial<PunchItem> = {}): PunchItem {
  return {
    id: "pu1",
    planItemId: null,
    title: "安全カバーのボルト不足",
    detail: null,
    assigneeId: null,
    assigneeName: null,
    dueDate: null,
    status: "open",
    closedAt: null,
    createdByName: "Alice",
    createdAt: "2026-10-01T00:00:00.000Z",
    photos: [],
    ...over,
  }
}

type Parts = Pick<MilestoneBoard, "stages" | "checks" | "punchItems" | "documents" | "budgetLines" | "metrics">

export function boardOf(parts: Partial<Parts> = {}, over: Partial<Omit<MilestoneBoard, keyof Parts | "summary">> = {}): MilestoneBoard {
  const p: Parts = { stages: [], checks: [], punchItems: [], documents: [], budgetLines: [], metrics: [], ...parts }
  const settings = over.settings ?? { checkLabel: "検収", budgetEnabled: false, trendEnabled: false }
  return {
    todayKey: TODAY,
    settings,
    templates: ["設備導入"],
    members: [{ id: "me", name: "Alice" }, { id: "u2", name: "Bob" }],
    permissions: { canEdit: true, canTrack: true },
    viewerId: "me",
    ...over,
    ...p,
    summary: summarizeBoard({ stages: p.stages, checks: p.checks, punchItems: p.punchItems, documents: p.documents, budgetEnabled: settings.budgetEnabled, budgetLines: p.budgetLines }, TODAY),
  } as MilestoneBoard
}
