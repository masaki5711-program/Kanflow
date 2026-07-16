"use client"

import { useLanguage } from "@/lib/language-context"

interface Props {
  isTranslated: boolean
  loading: boolean
  error: boolean
  onClick: () => void
  disabled?: boolean
  className?: string
}

/**
 * Compact toggle button for view-mode bilingual display.
 * Differs from the form-mode BilingualButton: this one shows whether
 * the text is currently shown bilingual, and lets the user revert.
 */
export function BilingualViewToggle({
  isTranslated,
  loading,
  error,
  onClick,
  disabled = false,
  className = "",
}: Props) {
  const { t } = useLanguage()
  const label = loading
    ? t.bilingualizing
    : error
    ? t.bilingualizeFailed
    : isTranslated
    ? t.bilingualizeRevert
    : t.bilingualize

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
        isTranslated
          ? "text-amber-700 hover:bg-amber-50"
          : "text-blue-600 hover:bg-blue-50 hover:text-blue-700"
      } disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed ${className}`}
      title={label}
    >
      <span aria-hidden>{isTranslated ? "✕" : "🌐"}</span>
      <span>{label}</span>
    </button>
  )
}
