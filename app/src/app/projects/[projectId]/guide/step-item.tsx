"use client"

import { useLanguage } from "@/lib/language-context"
import { Info } from "lucide-react"
import { DisclosureChevron, cn } from "@/components/ui"
import type { StepData } from "./guide-steps"

interface StepItemProps {
  step: StepData
  index: number
  isOpen: boolean
  isLast: boolean
  onToggle: () => void
}

/** One numbered, collapsible step of the getting-started timeline. */
export function StepItem({ step, index, isOpen, isLast, onToggle }: StepItemProps) {
  const { t } = useLanguage()
  const panelId = `guide-${step.id}-panel`
  const headerId = `guide-${step.id}-header`

  return (
    <div className="flex gap-4">
      {/* Number badge: mouse shortcut only; the header button is the accessible toggle. */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={onToggle}
          className={`w-10 h-10 rounded-full ${step.color} text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-md hover:scale-110 transition-transform`}
        >
          {index + 1}
        </button>
        {!isLast && <div className="w-0.5 flex-1 bg-slate-200 my-1" />}
      </div>

      <div className="flex-1 pb-6">
        <h3>
          <button
            type="button"
            id={headerId}
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="flex items-center gap-3 w-full text-left group rounded-ui-sm"
          >
            <span className={`w-8 h-8 rounded-lg ${step.color}/10 flex items-center justify-center shrink-0`}>
              <step.icon className={`w-5 h-5 ${step.color.replace("bg-", "text-")}`} />
            </span>
            <span className="text-base font-semibold text-fg group-hover:text-primary transition-colors flex-1">
              <span className="sr-only">{index + 1}. </span>
              {step.title}
            </span>
            <DisclosureChevron open={isOpen} variant="down" className="h-5 w-5 text-fg-muted" />
          </button>
        </h3>

        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          aria-hidden={!isOpen}
          inert={!isOpen}
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            isOpen ? "max-h-[800px] opacity-100 mt-3" : "max-h-0 opacity-0",
          )}
        >
          <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>

          {step.operation && (
            <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="text-caption font-semibold text-blue-800 mb-1">{t.guideKanflowOperation}</p>
              <p className="text-sm text-blue-700">{step.operation}</p>
            </div>
          )}

          {step.hint && (
            <div className="mt-2 flex items-start gap-2 text-caption text-fg-muted">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <span className="sr-only">{t.guideHint}: </span>
                {step.hint}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
