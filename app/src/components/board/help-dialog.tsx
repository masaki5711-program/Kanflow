"use client"

import { Button, Modal, useModalClose } from "@/components/ui"
import type { Translations } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"

const ROWS: (keyof Translations)[] = [
  "wbHelp01",
  "wbHelp02",
  "wbHelp03",
  "wbHelp04",
  "wbHelp05",
  "wbHelp06",
  "wbHelp07",
  "wbHelp08",
  "wbHelp09",
  "wbHelp10",
  "wbHelp11",
  "wbHelp12",
  "wbHelp13",
  "wbHelp14",
  "wbHelp15",
  "wbHelp16",
  "wbHelp17",
  "wbHelp18",
  "wbHelp19",
]

/** The White Board's mouse and keyboard operations at a glance (`?` or the toolbar's guide button). */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <Modal open onClose={onClose} title={t.wbHelpTitle} size="md" footer={<CloseButton />}>
      <table className="w-full border-collapse text-body" data-testid="board-help">
        <tbody>
          {ROWS.map((key) => {
            const [keys, what] = String(t[key]).split("\t")
            return (
              <tr key={key} className="border-b border-border last:border-0">
                <th scope="row" className="whitespace-nowrap py-1.5 pr-4 text-left align-top font-medium text-fg">
                  <kbd className="rounded-ui-sm border border-border bg-surface-sunken px-1.5 py-0.5 font-sans text-caption">{keys}</kbd>
                </th>
                <td className="py-1.5 text-fg-muted">{what}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Modal>
  )
}

function CloseButton() {
  const { t } = useLanguage()
  const close = useModalClose()
  return <Button onClick={close}>{t.wbHelpClose}</Button>
}
