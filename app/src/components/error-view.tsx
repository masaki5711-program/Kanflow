"use client"

import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { Button, buttonClasses, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

interface ErrorViewProps {
  error: Error & { digest?: string }
  reset: () => void
  /** Show a "go home" link next to Retry. */
  showHomeLink?: boolean
  className?: string
}

/** Shared body of the route error boundaries (`error.tsx`). */
export function ErrorView({ error, reset, showHomeLink = false, className }: ErrorViewProps) {
  // Error boundaries render inside the root layout, so the user's language is available.
  const { t } = useLanguage()
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="text-center max-w-md mx-auto px-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-ui-lg bg-danger-soft mb-4" aria-hidden="true">
          <AlertCircle className="w-7 h-7 text-danger" />
        </div>
        <h2 className="text-title font-bold text-fg mb-2">{t.errorPageTitle}</h2>
        <p role="alert" className="text-body text-fg-muted mb-6 break-words">
          {error.message || t.errorPageMessage}
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button onClick={reset}>{t.errorRetry}</Button>
          {showHomeLink && (
            <Link href="/" className={buttonClasses({ variant: "secondary" })}>
              {t.errorGoHome}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
