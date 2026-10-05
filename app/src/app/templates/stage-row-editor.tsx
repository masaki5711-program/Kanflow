"use client"

import { useId, useState } from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, CornerDownRight, Trash2 } from "lucide-react"
import { IconButton, Input, Textarea, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import type { EditorNode } from "./lib/editor-state"

export type StageOp = "up" | "down" | "indent" | "outdent" | "child" | "remove"

interface Props {
  node: EditorNode
  depth: number
  /** Which structural operations are possible here. */
  can: Record<Exclude<StageOp, "remove">, boolean>
  disabled: boolean
  onField: (patch: Partial<Omit<EditorNode, "key" | "children">>) => void
  onOp: (op: StageOp) => void
}

/**
 * One stage of the template editor: name, milestone, 目安期間 and the
 * structure buttons (move / indent / outdent / add child / remove), plus a
 * collapsible details area (メモ, 完了条件). Wraps to two lines on phones.
 */
export function StageRowEditor({ node, depth, can, disabled, onField, onOp }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const isParent = node.children.length > 0
  const ops: Array<{ op: StageOp; label: string; icon: React.ReactNode; enabled: boolean }> = [
    { op: "up", label: t.tplMoveUp, icon: <ArrowUp className="h-4 w-4" />, enabled: can.up },
    { op: "down", label: t.tplMoveDown, icon: <ArrowDown className="h-4 w-4" />, enabled: can.down },
    { op: "outdent", label: t.tplOutdent, icon: <ArrowLeft className="h-4 w-4" />, enabled: can.outdent },
    { op: "indent", label: t.tplIndent, icon: <ArrowRight className="h-4 w-4" />, enabled: can.indent },
    { op: "child", label: t.tplAddChild, icon: <CornerDownRight className="h-4 w-4" />, enabled: can.child },
    { op: "remove", label: t.tplRemoveStage, icon: <Trash2 className="h-4 w-4" />, enabled: true },
  ]

  return (
    <li data-stage-key={node.key} className="rounded-ui-sm border border-border bg-surface" style={{ marginLeft: depth * 20 }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 p-1.5">
        <IconButton
          size="sm"
          label={t.tplStageDetails}
          aria-expanded={open}
          aria-controls={detailsId}
          icon={open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          onClick={() => setOpen((v) => !v)}
        />
        <Input
          data-stage-input={node.key}
          aria-label={t.tplStageName}
          value={node.name}
          maxLength={255}
          disabled={disabled}
          onChange={(e) => onField({ name: e.target.value })}
          className={cn("min-w-0 flex-[1_1_12rem]", depth === 0 && "font-medium")}
        />
        <label className={cn("inline-flex min-h-9 items-center gap-1.5 text-caption text-fg-muted", isParent && "opacity-50")}>
          <input type="checkbox" className="h-4 w-4" checked={node.isMilestone && !isParent} disabled={disabled || isParent} onChange={(e) => onField({ isMilestone: e.target.checked })} />
          {t.tplMilestone}
        </label>
        <label className="inline-flex items-center gap-1 text-caption text-fg-muted">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            aria-label={t.tplDuration}
            title={t.tplDuration}
            value={node.durationDays}
            disabled={disabled}
            onChange={(e) => onField({ durationDays: e.target.value })}
            className="w-20"
          />
          <span aria-hidden="true">{t.tplDaysUnit}</span>
        </label>
        <div role="group" aria-label={node.name || t.tplStages} className="ml-auto flex items-center">
          {ops.map((o) => (
            <IconButton key={o.op} size="sm" label={o.label} data-op={o.op} icon={o.icon} disabled={disabled || !o.enabled} onClick={() => onOp(o.op)} />
          ))}
        </div>
      </div>
      {open && (
        <div id={detailsId} className="grid gap-2 border-t border-border p-2 sm:grid-cols-2">
          <label className="text-caption text-fg-muted">
            {t.tplStageDescription}
            <Textarea rows={2} value={node.description} maxLength={2000} disabled={disabled} onChange={(e) => onField({ description: e.target.value })} />
          </label>
          <label className="text-caption text-fg-muted">
            {`${t.tplChecklist} (${t.tplChecklistHint})`}
            <Textarea rows={2} value={node.checklistText} disabled={disabled} onChange={(e) => onField({ checklistText: e.target.value })} />
          </label>
        </div>
      )}
    </li>
  )
}
