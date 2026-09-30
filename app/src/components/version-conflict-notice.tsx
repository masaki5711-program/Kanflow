"use client"

import { X } from "lucide-react"
import { Button, IconButton } from "@/components/ui"
import type { LostEdit } from "@/hooks/version-conflict"
import { useLanguage } from "@/lib/language-context"

/** Longest value shown per field (the full text stays in the title tooltip). */
const MAX_VALUE_CHARS = 200

interface Props {
  /** From `useConflictRebase().lost`. */
  lost: readonly LostEdit[]
  /** Field → label shown in the list (unknown fields show the key). */
  labels: Readonly<Record<string, string>>
  /** Display text of a value (default: String()). */
  formatValue?: (field: string, value: unknown) => string
  /** Put the user's values back into the form (they then save over the latest version knowingly). */
  onRestore?: () => void
  onDismiss: () => void
}

/**
 * Shown in an edit form after a 409 VERSION_CONFLICT: "the latest version
 * was loaded, enter your changes again", with the values the user had typed
 * so they can be re-entered (or restored in one click).
 */
export function VersionConflictNotice({ lost, labels, formatValue, onRestore, onDismiss }: Props) {
  const { t } = useLanguage()
  const show = (field: string, value: unknown) => {
    const text = formatValue ? formatValue(field, value) : value === null || value === undefined ? "" : String(value)
    return text.trim() ? text : t.apiErrVersionConflictEmpty
  }
  return (
    <div role="alert" className="rounded-ui-md border border-warning/40 bg-warning-soft px-3 py-2 text-body text-warning-strong">
      <div className="flex items-start gap-2">
        <p className="flex-1 font-medium">{t.apiErrVersionConflictReenter}</p>
        <IconButton size="sm" label={t.close} icon={<X className="h-4 w-4" />} onClick={onDismiss} />
      </div>
      {lost.length > 0 && (
        <details className="mt-1" open>
          <summary className="cursor-pointer text-caption font-semibold">{t.apiErrVersionConflictYourInput}</summary>
          <dl className="mt-1 space-y-1 text-caption">
            {lost.map((e) => {
              const value = show(e.field, e.mine)
              return (
                <div key={e.field} className="flex gap-2">
                  <dt className="shrink-0 font-semibold">{labels[e.field] ?? e.field}:</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words" title={value}>
                    {value.length > MAX_VALUE_CHARS ? `${value.slice(0, MAX_VALUE_CHARS)}…` : value}
                  </dd>
                </div>
              )
            })}
          </dl>
          {onRestore && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={onRestore}>
              {t.apiErrVersionConflictRestore}
            </Button>
          )}
        </details>
      )}
    </div>
  )
}
