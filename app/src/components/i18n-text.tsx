"use client"

import { useCallback, useState, type ElementType, type MouseEvent, type ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { pickText, type PickedText } from "@/lib/translation/pick-text"
import { apiFetch } from "@/hooks"
import { useOptionalToast } from "@/components/ui"
import { announce } from "@/components/live-announcer"
import type { EntityI18n } from "@/lib/translation/types"

export type { EntityI18n }

/**
 * Viewer-locale text for a translatable field: the current language side
 * when it exists, otherwise the original plus a small "pending" badge.
 */
export function useI18nText(i18n: EntityI18n | null | undefined, field: string, original: string | null | undefined): PickedText {
  const { language } = useLanguage()
  return pickText(i18n, field, original, language)
}

/** Ancestors in which another interactive element must not be nested. */
const INTERACTIVE_ANCESTOR =
  'a[href], button, summary, label, select, option, [role="button"], [role="link"], [role="option"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"]'

/**
 * Whether the element is rendered inside an interactive parent (link, button,
 * option…). `null` until the node is attached. A callback ref (no effect) —
 * callers render plain text while the answer is unknown.
 */
function useNestedInInteractive(): [boolean | null, (node: HTMLElement | null) => void] {
  const [nested, setNested] = useState<boolean | null>(null)
  const ref = useCallback((node: HTMLElement | null) => {
    if (node) setNested(!!node.parentElement?.closest(INTERACTIVE_ANCESTOR))
  }, [])
  return [nested, ref]
}

/**
 * Language of the text actually displayed when it differs from the UI
 * language: the viewer side when translated, otherwise the stored source side.
 */
function displayedTextLang(
  i18n: EntityI18n | null | undefined,
  field: string,
  picked: PickedText,
  language: string,
): string | undefined {
  const entry = i18n?.[field]
  if (!entry) return undefined
  const lang = picked.translated ? language : entry.source
  return lang === language ? undefined : lang
}

/**
 * Hover text of a translated field: the DISPLAYED text first (the full text
 * when a truncated label is hovered), then the source text, labelled as such
 * (A4-05: a bare source-language tooltip read as an untranslated leak).
 * Untranslated text gets no tooltip, so a parent's truncation title applies.
 */
export function translatedTooltip(picked: PickedText, originalLabel: string): string | undefined {
  if (!picked.translated || !picked.original) return undefined
  return `${picked.text}\n${originalLabel}: ${picked.original}`
}

interface I18nTextProps {
  i18n: EntityI18n | null | undefined
  field: string
  original: string | null | undefined
  /** Wrapper element (default span). */
  as?: ElementType
  className?: string
  /** Hide the pending / failed badge (compact places such as select options). */
  noBadge?: boolean
  /** Identify the row so the badge can offer "translate now". */
  entity?: { type: string; id: string }
  /** Rendered when the text is empty. */
  fallback?: ReactNode
}

/**
 * Drop-in replacement for `{item.field}` in JSX. Keeps line breaks the way the
 * caller's CSS does (pass `whitespace-pre-wrap` via className when needed).
 *
 * - Untranslated text shown in another UI language carries the `lang` of its
 *   source language (WCAG 3.1.2).
 * - A translated text offers a small "原文" toggle (keyboard / touch reachable)
 *   revealing the original inline — except inside a link / button, where only
 *   the `title` tooltip is possible without nesting controls.
 */
export function I18nText({ i18n, field, original, as, className, noBadge, entity, fallback }: I18nTextProps) {
  const { language, t } = useLanguage()
  const picked = useI18nText(i18n, field, original)
  const [nested, nestRef] = useNestedInInteractive()
  const [showOriginal, setShowOriginal] = useState(false)
  const Tag: ElementType = as ?? "span"
  if (!picked.text) return fallback === undefined ? null : <>{fallback}</>

  const canToggle = !noBadge && picked.translated && !!picked.original && nested === false
  return (
    <Tag
      ref={nestRef}
      className={className}
      lang={displayedTextLang(i18n, field, picked, language)}
      title={translatedTooltip(picked, t.translationOriginalLabel)}
    >
      {picked.text}
      {!noBadge && (picked.pending || picked.failed) && (
        <PendingBadge failed={picked.failed} entity={entity} field={field} />
      )}
      {canToggle && <OriginalToggle expanded={showOriginal} onToggle={() => setShowOriginal((v) => !v)} />}
      {canToggle && showOriginal && (
        <span className="mt-0.5 block text-caption text-fg-muted" lang={i18n?.[field]?.source}>
          {picked.original}
        </span>
      )}
    </Tag>
  )
}

export function OriginalToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      aria-expanded={expanded}
      title={expanded ? t.translationHideOriginal : t.translationShowOriginal}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="ml-1 inline-flex min-h-6 items-center rounded px-1 align-middle text-caption font-normal text-fg-muted underline decoration-dotted underline-offset-2 hover:bg-surface-sunken hover:text-fg"
    >
      {t.translationOriginalLabel}
    </button>
  )
}

/**
 * "翻訳待ち" badge. When the row is identified and the badge is NOT inside a
 * link / button it is a real <button> that asks the server to translate the
 * field right now (high priority) and reloads data via `onDone`. Inside an
 * interactive parent it is plain status text (a nested control would be
 * invalid). Progress is announced through the single shared live region.
 */
export function PendingBadge({
  failed,
  entity,
  field,
  onDone,
}: {
  failed?: boolean
  entity?: { type: string; id: string }
  field?: string
  onDone?: () => void
}) {
  const { t } = useLanguage()
  const toast = useOptionalToast()
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle")
  const [nested, nestRef] = useNestedInInteractive()

  const translateNow = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!entity || !field || state === "busy") return
      setState("busy")
      announce(t.translationBusy)
      try {
        await apiFetch("/api/ai/translate", {
          method: "POST",
          json: { entityType: entity.type, entityId: entity.id, field },
        })
        setState("done")
        announce(t.translationDone)
        onDone?.()
      } catch (err) {
        setState("error")
        toast?.error(err instanceof Error ? err.message : String(err), { title: t.translationFailed })
      }
    },
    [entity, field, state, onDone, toast, t.translationFailed, t.translationBusy, t.translationDone],
  )

  const label =
    state === "busy"
      ? t.translationBusy
      : state === "done"
        ? t.translationDone
        : failed || state === "error"
          ? t.translationFailed
          : t.translationPending
  const clickable = !!entity && !!field && state === "idle" && nested === false
  const tone =
    (failed || state === "error") && state !== "done"
      ? "bg-danger-soft text-danger-strong"
      : state === "done"
        ? "bg-success-soft text-success-strong"
        : "bg-warning-soft text-warning-strong"
  const base = `inline-flex items-center rounded px-1 py-px text-caption font-medium whitespace-nowrap ${tone}`
  return (
    <span ref={nestRef} className="ml-1 inline-flex align-middle">
      {clickable ? (
        <button type="button" onClick={translateNow} title={t.translationNowHint} className={`${base} cursor-pointer hover:brightness-95`}>
          {label}
        </button>
      ) : (
        <span className={base}>{label}</span>
      )}
    </span>
  )
}

/**
 * Hint shown next to free-text inputs: `用語<<訳語>>` registers a glossary pair.
 */
export function GlossaryHint({ className = "" }: { className?: string }) {
  const { t } = useLanguage()
  return (
    <p className={`text-caption text-fg-muted ${className}`} title={t.glossaryHintTitle}>
      {t.glossaryHint}
    </p>
  )
}
