import { ClipboardList, Lightbulb, RefreshCw, Rocket, Search, Target, TrendingUp, Zap, type LucideIcon } from "lucide-react"
import type { Language } from "@/lib/i18n"
import type { ProjectType, ProjectTypeLabels } from "@/lib/project-type-labels"
import { SOFTWARE_STEPS } from "./steps-software"
import { processImprovementSteps } from "./steps-process-improvement"
import { generalSteps } from "./steps-general"

/** Localized text of one getting-started step. */
export interface StepText {
  title: string
  description: string
  operation?: string
  hint?: string
}

export interface StepData extends StepText {
  /** Stable id (position in the workflow). */
  id: string
  /** Decorative step icon (lucide component). */
  icon: LucideIcon
  color: string
}

const STEP_ICONS: readonly LucideIcon[] = [Target, Lightbulb, Search, ClipboardList, Zap, TrendingUp, RefreshCw, Rocket]

const STEP_COLORS = [
  "bg-violet-500",
  "bg-yellow-500",
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-rose-500",
] as const

function withVisuals(steps: StepText[]): StepData[] {
  return steps.map((s, i) => ({
    ...s,
    id: `step-${i}`,
    icon: STEP_ICONS[i % STEP_ICONS.length],
    color: STEP_COLORS[i % STEP_COLORS.length],
  }))
}

export function getSteps(projectType: ProjectType, pt: ProjectTypeLabels, language: Language): StepData[] {
  if (projectType === "process_improvement" || projectType === "equipment") return withVisuals(processImprovementSteps(pt)[language])
  if (projectType === "general") return withVisuals(generalSteps(pt)[language])
  return withVisuals(SOFTWARE_STEPS[language])
}
