"use client"

import type { PlanAssist } from "../hooks/use-plan-assist"
import type { PlanItem, Ymd } from "../lib/plan-types"
import { PlanBulkDialog } from "./plan-bulk-dialog"
import { PlanImportDialog } from "./plan-import-dialog"
import { PlanReflowDialog } from "./plan-reflow-dialog"
import { PlanShiftDialog } from "./plan-shift-dialog"

interface Props {
  assist: PlanAssist
  /** `/api/projects/:id/plan` */
  apiBase: string
  items: readonly PlanItem[]
  members: readonly { id: string; name: string }[]
  today: Ymd
  nameOf: (item: PlanItem) => string
  onChanged: () => void
}

/** The dialogs the scheduling assists open (followers question, bulk edit, reflow, import). */
export function PlanAssistDialogs({ assist, apiBase, items, members, today, nameOf, onChanged }: Props) {
  const { cascade, bulk, reflowOpen, importOpen } = assist
  return (
    <>
      {cascade && (
        <PlanShiftDialog
          apiBase={apiBase}
          itemId={cascade.id}
          slip={cascade.delta}
          hasSuccessors
          cascade={{ name: cascade.name }}
          onClose={() => assist.setCascade(null)}
          onApplied={() => {
            assist.setCascade(null)
            onChanged()
          }}
        />
      )}
      {bulk && (
        <PlanBulkDialog
          apiBase={apiBase}
          mode={bulk}
          ids={[...assist.checked]}
          today={today}
          members={members}
          onClose={() => assist.setBulk(null)}
          onApplied={() => {
            assist.setBulk(null)
            onChanged()
          }}
        />
      )}
      {reflowOpen && (
        <PlanReflowDialog
          apiBase={apiBase}
          onClose={() => assist.setReflowOpen(false)}
          onApplied={() => {
            assist.setReflowOpen(false)
            onChanged()
          }}
        />
      )}
      {importOpen && (
        <PlanImportDialog
          apiBase={apiBase}
          items={items}
          members={members}
          today={today}
          nameOf={nameOf}
          onClose={() => assist.setImportOpen(false)}
          onImported={() => {
            assist.setImportOpen(false)
            onChanged()
          }}
        />
      )}
    </>
  )
}
