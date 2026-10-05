"use client"

import { useId, type ReactNode } from "react"

interface Props {
  title: string
  icon?: ReactNode
  /** Right side of the heading row (e.g. a count). */
  aside?: ReactNode
  children: ReactNode
}

/** One titled section of the improvement detail dialog (a labelled region). */
export function SectionFrame({ title, icon, aside, children }: Props) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-ui-md border border-border bg-surface p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id={id} className="flex items-center gap-2 text-body-lg font-semibold text-fg">
          {icon}
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

export type Announce = (message: string, tone?: "success" | "error") => void
