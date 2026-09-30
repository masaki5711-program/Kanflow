"use client"

import type { Dispatch, ReactNode, SetStateAction } from "react"
import { Field, Select, useConfirm } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { PbiForm } from "./pbi-form-state"
import type { IceboxUsage, PbiFormOptions } from "./use-pbi-form-options"
import { Lightbulb, Target } from "lucide-react"

const MAX_OPTION_CHARS = 60

interface Props {
  form: PbiForm
  setForm: Dispatch<SetStateAction<PbiForm>>
  options: PbiFormOptions
  /** The PBI being edited (its own IceBox link is not a "reuse"). */
  selfId?: string
}

export function LabelWithIcon({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {text}
    </span>
  )
}

/** Usage of an IceBox request by a PBI other than `selfId`. */
function usageOf(options: PbiFormOptions, iceboxId: string, selfId?: string): IceboxUsage | undefined {
  const used = options.iceboxUsage.get(iceboxId)
  return used && used.pbiId !== selfId ? used : undefined
}

/** Source IceBox request + product goal pickers (with the "already used by another PBI" warning). */
export function PbiLinkFields({ form, setForm, options, selfId }: Props) {
  const { t, pt, language } = useLanguage()
  const confirm = useConfirm()

  async function selectIcebox(iceboxId: string) {
    const icebox = options.iceboxOptions.find((i) => i.id === iceboxId)
    if (!iceboxId || !icebox) {
      setForm((prev) => ({ ...prev, iceboxItemId: "" }))
      return
    }
    // The ⚠ tag in the dropdown is easy to miss when picking via keyboard: ask.
    const used = usageOf(options, iceboxId, selfId)
    if (used) {
      const ok = await confirm({
        title: t.backlogIceboxAlreadyUsedTitle,
        message: `${t.backlogIceboxAlreadyUsedBody}\n\n→ #${used.displayId} ${used.label}`,
        confirmLabel: t.backlogIceboxReuseAnyway,
        cancelLabel: t.cancel,
        variant: "danger",
      })
      if (!ok) {
        setForm((prev) => ({ ...prev, iceboxItemId: "" }))
        return
      }
    }
    setForm((prev) => ({ ...prev, iceboxItemId: iceboxId, userStory: prev.userStory || icebox.request }))
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={<LabelWithIcon icon={<Lightbulb className="h-3.5 w-3.5 text-purple-600" />} text={pt.iceboxTitle} />}>
          <Select value={form.iceboxItemId} onChange={(e) => void selectIcebox(e.target.value)}>
            <option value="">{t.backlogIceboxNoneOption}</option>
            {options.iceboxOptions.map((item) => {
              const used = usageOf(options, item.id, selfId)
              const prefix = used ? `⚠ [${t.backlogIceboxAlreadyUsedTag}] ` : ""
              const suffix = used ? ` → PBI #${used.displayId}` : ""
              const req = pickText(item.i18n, "request", item.request, language).text
              const short = req.length > MAX_OPTION_CHARS ? `${req.slice(0, MAX_OPTION_CHARS)}…` : req
              return (
                <option key={item.id} value={item.id}>
                  {prefix}#{item.displayId} - {short} ({item.author}){suffix}
                </option>
              )
            })}
          </Select>
        </Field>
        <Field label={<LabelWithIcon icon={<Target className="h-3.5 w-3.5 text-indigo-600" />} text={t.dashboardProductGoals} />}>
          <Select value={form.productGoalId} onChange={(e) => setForm((prev) => ({ ...prev, productGoalId: e.target.value }))}>
            <option value="">{t.eventNone}</option>
            {options.goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {pickText(goal.i18n, "title", goal.title, language).text}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {form.iceboxItemId && usageOf(options, form.iceboxItemId, selfId) && (
        <p role="status" className="rounded-ui-sm border border-warning/30 bg-warning-soft px-2 py-1 text-caption text-warning-strong">
          ⚠ {t.backlogIceboxAlreadyUsedTitle}
        </p>
      )}
    </>
  )
}
