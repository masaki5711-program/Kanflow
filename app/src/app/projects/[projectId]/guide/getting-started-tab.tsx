"use client"

import { useCallback, useMemo, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import type { ProjectType } from "@/lib/project-type-labels"
import { getSteps } from "./guide-steps"
import { StepItem } from "./step-item"
import ScrumOverviewDiagram from "./scrum-overview-diagram"

type IntroKey = "guideIntroSoftware" | "guideIntroProcessImprovement" | "guideIntroEquipment" | "guideIntroGeneral"

const INTRO_KEY: Record<ProjectType, IntroKey> = {
  software: "guideIntroSoftware",
  process_improvement: "guideIntroProcessImprovement",
  equipment: "guideIntroEquipment",
  general: "guideIntroGeneral",
}

/** Step ids are positional (`step-0` …), so the first step is open by default. */
const INITIAL_OPEN: Record<string, boolean> = { "step-0": true }

export function GettingStartedTab() {
  const { t, projectType, pt, language } = useLanguage()
  const steps = useMemo(() => getSteps(projectType, pt, language), [projectType, pt, language])
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>(INITIAL_OPEN)

  const toggle = useCallback((id: string) => {
    setOpenSteps((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  return (
    <div className="space-y-0">
      <div className="mb-6">
        <p className="text-sm text-slate-600 leading-relaxed">{t[INTRO_KEY[projectType]]}</p>
      </div>
      {projectType === "software" && <ScrumOverviewDiagram />}
      {steps.map((step, i) => (
        <StepItem
          key={step.id}
          step={step}
          index={i}
          isOpen={!!openSteps[step.id]}
          isLast={i === steps.length - 1}
          onToggle={() => toggle(step.id)}
        />
      ))}
    </div>
  )
}
