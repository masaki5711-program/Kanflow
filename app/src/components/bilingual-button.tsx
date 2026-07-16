"use client"

import { useLanguage } from "@/lib/language-context"

interface BilingualButtonProps {
  onClick: () => void
  disabled?: boolean
  translating: boolean
  className?: string
}

export function BilingualButton({
  onClick,
  disabled = false,
  translating,
  className = "",
}: BilingualButtonProps) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || translating}
      className={`inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed px-2 py-0.5 rounded transition-colors ${className}`}
      title={t.bilingualize}
    >
      <span aria-hidden>🌐</span>
      {translating ? t.bilingualizing : t.bilingualize}
    </button>
  )
}
