"use client"

import { Languages } from "lucide-react"
import { cn } from "@/components/ui"
import { type Language, languageLabels } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"

const LANGUAGES = Object.keys(languageLabels) as Language[]

/**
 * Compact display-language menu for the header (personal preference, saved
 * to the user via `setLanguage`). A native <select> keeps it keyboard / touch
 * friendly without a custom popover.
 */
export function LanguageMenu({ className }: { className?: string }) {
  const { t, language, setLanguage } = useLanguage()
  return (
    <label
      title={t.navLanguageMenu}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-body font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg",
        className,
      )}
    >
      <Languages aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="sr-only">{t.navLanguageMenu}</span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="max-w-24 cursor-pointer truncate bg-transparent text-body text-inherit sm:max-w-none"
      >
        {LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {languageLabels[code]}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Segmented language buttons (used on the /me page). */
export function LanguageButtons({ label }: { label: string }) {
  const { language, setLanguage } = useLanguage()
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-3">
      {LANGUAGES.map((lang) => {
        const active = language === lang
        return (
          <button
            key={lang}
            type="button"
            lang={lang}
            aria-pressed={active}
            onClick={() => setLanguage(lang)}
            className={cn(
              "min-h-9 rounded-ui-sm border px-4 py-2 text-body font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-fg"
                : "border-border-strong bg-surface text-fg hover:bg-surface-muted",
            )}
          >
            {languageLabels[lang]}
          </button>
        )
      })}
    </div>
  )
}
