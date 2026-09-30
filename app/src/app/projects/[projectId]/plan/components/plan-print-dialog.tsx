"use client"

import { useState } from "react"
import { Printer } from "lucide-react"
import { Button, Modal } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { PRINT_SCOPES, type PrintScope } from "../lib/print"

interface Props {
  /** "10/01(木) 〜 11/15(日)" per scope. */
  ranges: Record<PrintScope, string>
  onPrint: (scope: PrintScope) => void
  onClose: () => void
}

/** Print options: the visible period or the whole plan, fitted to an A4 landscape page. */
export function PlanPrintDialog({ ranges, onPrint, onClose }: Props) {
  const { t } = useLanguage()
  const [scope, setScope] = useState<PrintScope>("all")
  const label: Record<PrintScope, string> = { visible: t.planPrintVisible, all: t.planPrintAll }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t.planPrint}
      description={t.planPrintHint}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.cancel}</Button>
          <Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => onPrint(scope)}>
            {t.planPrintSubmit}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-caption font-medium text-fg-muted">{t.planPrintTitle}</legend>
        {PRINT_SCOPES.map((s) => (
          <label
            key={s}
            className="flex cursor-pointer items-start gap-3 rounded-ui-md border border-border px-3 py-2.5 hover:bg-surface-muted has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40"
          >
            <input type="radio" name="plan-print-scope" className="mt-0.5 h-4 w-4" checked={scope === s} onChange={() => setScope(s)} data-autofocus={scope === s ? "" : undefined} />
            <span className="min-w-0">
              <span className="block text-body font-medium text-fg">{label[s]}</span>
              <span className="block text-caption text-fg-muted tabular-nums">{ranges[s]}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Modal>
  )
}
