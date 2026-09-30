"use client"

import { ProjectPageSkeleton } from "@/components/app-shell/route-states"

/** Project dashboard (server-rendered) and any project subpage without its own skeleton. */
export default function ProjectLoading() {
  return <ProjectPageSkeleton />
}
