"use client"

import { Fragment, type ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { Modal } from "@/components/ui"
import type { GoKey } from "@/hooks/use-shortcuts"

export interface ShortcutsHelpProps {
  open: boolean
  onClose: () => void
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-7 items-center justify-center rounded-ui-sm border border-border-strong bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-fg">
      {children}
    </kbd>
  )
}

interface Row {
  keys: ReactNode
  label: string
}

function ShortcutTable({ caption, rows }: { caption: string; rows: Row[] }) {
  return (
    <table className="w-full text-left">
      <caption className="pb-1 text-left text-caption font-semibold text-fg-subtle">{caption}</caption>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" className="w-40 py-2 pr-4 align-top font-normal">
              <span className="flex flex-wrap items-center gap-1 text-caption text-fg-muted">{row.keys}</span>
            </th>
            <td className="py-2 text-body text-fg">{row.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** `?` dialog listing every keyboard shortcut (see hooks/use-shortcuts.ts). */
export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const { t, pt } = useLanguage()
  const pages: Record<GoKey, string> = {
    d: t.navDashboard,
    b: pt.navBacklog,
    s: pt.navSprints,
    p: t.planTitle,
    i: pt.navIcebox,
  }
  const general: Row[] = [
    { keys: <Kbd>?</Kbd>, label: t.shortcutsOpenHelp },
    {
      keys: (
        <>
          <Kbd>/</Kbd>
          {t.shortcutsOr}
          <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>
          {t.shortcutsOr}
          <Kbd>⌘</Kbd>+<Kbd>K</Kbd>
        </>
      ),
      label: t.shortcutsOpenSearch,
    },
  ]
  const navigation: Row[] = (Object.keys(pages) as GoKey[]).map((key) => ({
    keys: (
      <Fragment>
        <Kbd>g</Kbd>
        {t.shortcutsThen}
        <Kbd>{key}</Kbd>
      </Fragment>
    ),
    label: fillTemplate(t.shortcutsGoTo, { page: pages[key] }),
  }))

  return (
    <Modal open={open} onClose={onClose} title={t.shortcutsTitle} description={t.shortcutsDescription} closeOnOverlayClick>
      <div className="space-y-5">
        <ShortcutTable caption={t.shortcutsGroupGeneral} rows={general} />
        <ShortcutTable caption={t.shortcutsGroupNavigation} rows={navigation} />
      </div>
    </Modal>
  )
}
