"use client"

import { AppPageSkeleton } from "@/components/app-shell/route-states"

/** Shown while a top-level server page (project list, /me, admin) loads. */
export default function Loading() {
  return <AppPageSkeleton />
}
