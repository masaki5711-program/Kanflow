/**
 * Fixtures for the 改善成果ボード component tests (not a test file itself):
 * a process_improvement LanguageProvider and board / item builders.
 */
import type { ReactElement, ReactNode } from "react"
import { render } from "@testing-library/react"
import { ConfirmProvider, ToastProvider } from "@/components/ui"
import { LanguageProvider } from "@/lib/language-context"
import { summarizeImprovements } from "@/lib/improvement/metrics"
import type { ImprovementBoard, ImprovementItem } from "../improvement-types"

export function KaizenProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider initialLanguage="ja" initialProjectType="process_improvement">
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </LanguageProvider>
  )
}

export function renderKaizen(ui: ReactElement) {
  return render(<KaizenProviders>{ui}</KaizenProviders>)
}

export function improvement(over: Partial<ImprovementItem> = {}): ImprovementItem {
  return {
    id: "r1",
    pbItemId: null,
    iceboxId: null,
    initiative: null,
    epic: null,
    userStory: "治具の共通化",
    assignedPo: null,
    planVersion: null,
    releaseVersion: null,
    releaseDate: null,
    releaseNote: null,
    manualLink: null,
    poNote: null,
    status: "staged",
    pbItem: null,
    metricCategory: null,
    metricName: null,
    metricUnit: null,
    direction: "decrease",
    baselineValue: null,
    targetValue: null,
    resultValue: null,
    annualEffectUsd: null,
    spaceSavedM2: null,
    kaizenStage: "measuring",
    standardizedAt: null,
    rollouts: [],
    checks: [],
    photos: [],
    ...over,
  }
}

export function boardOf(items: ImprovementItem[], permissions = { canManage: true, canTrack: true }): ImprovementBoard {
  return { items, summary: summarizeImprovements(items), rolloutNames: ["第2ライン", "YMMA"], permissions }
}
