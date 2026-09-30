"use client"

import { ErrorView } from "@/components/error-view"

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorView error={error} reset={reset} showHomeLink className="py-16" />
}
