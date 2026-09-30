"use client"

import Link from "next/link"
import { useLanguage } from "@/lib/language-context"

/** The same "← project list" link on top of every admin page (A3-18: back links differed per page). */
export function AdminBackLink() {
  const { t } = useLanguage()
  return (
    <Link
      href="/"
      data-testid="admin-back-link"
      className="mb-2 inline-flex min-h-6 items-center rounded-ui-sm text-body text-fg-muted hover:text-primary"
    >
      {t.projectBackToList}
    </Link>
  )
}
