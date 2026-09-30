"use client"

import { NotFoundView } from "@/components/app-shell/route-states"

export default function NotFound() {
  return (
    <main id="main-content" className="min-h-screen bg-surface-muted">
      <NotFoundView className="min-h-screen" />
    </main>
  )
}
