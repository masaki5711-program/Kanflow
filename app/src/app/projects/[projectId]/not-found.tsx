"use client"

import { NotFoundView } from "@/components/app-shell/route-states"

/** `notFound()` from the project pages (unknown project or no access). */
export default function ProjectNotFound() {
  return <NotFoundView variant="project" className="py-16" />
}
