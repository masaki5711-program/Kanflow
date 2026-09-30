"use client"

import { AppPageSkeleton } from "@/components/app-shell/route-states"

/**
 * Loading skeleton of the top-level pages. It lives in each top-level segment
 * (home, /me, /admin, /portfolio, /settings) instead of `app/loading.tsx`: a
 * root boundary would also wrap `projects/[projectId]/layout.tsx`, so its
 * `notFound()` would stream as HTTP 200 instead of a real 404.
 */
export default function Loading() {
  return <AppPageSkeleton />
}
