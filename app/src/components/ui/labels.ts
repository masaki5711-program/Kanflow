"use client"

import { useLanguage } from "@/lib/language-context"
import type { Language } from "@/lib/i18n"

/**
 * Default labels for the UI kit. Kept local (instead of in lib/i18n) so the
 * primitives stay self-contained; every label can still be overridden via
 * component props.
 */
export interface UiLabels {
  ok: string
  cancel: string
  close: string
  loading: string
  dismiss: string
  notifications: string
  unsavedTitle: string
  unsavedMessage: string
  discard: string
  required: string
}

export const UI_LABELS: Record<Language, UiLabels> = {
  ja: {
    ok: "OK",
    cancel: "キャンセル",
    close: "閉じる",
    loading: "読み込み中…",
    dismiss: "通知を閉じる",
    notifications: "通知",
    unsavedTitle: "未保存の変更があります",
    unsavedMessage: "変更内容は保存されていません。破棄して閉じますか？",
    discard: "破棄して閉じる",
    required: "必須",
  },
  en: {
    ok: "OK",
    cancel: "Cancel",
    close: "Close",
    loading: "Loading…",
    dismiss: "Dismiss notification",
    notifications: "Notifications",
    unsavedTitle: "Unsaved changes",
    unsavedMessage: "Your changes have not been saved. Discard them and close?",
    discard: "Discard and close",
    required: "Required",
  },
  id: {
    ok: "OK",
    cancel: "Batal",
    close: "Tutup",
    loading: "Memuat…",
    dismiss: "Tutup notifikasi",
    notifications: "Notifikasi",
    unsavedTitle: "Ada perubahan yang belum disimpan",
    unsavedMessage: "Perubahan Anda belum disimpan. Buang perubahan dan tutup?",
    discard: "Buang dan tutup",
    required: "Wajib",
  },
}

export function getUiLabels(language: Language): UiLabels {
  return UI_LABELS[language] ?? UI_LABELS.ja
}

/** Labels for the current UI language (falls back to Japanese). */
export function useUiLabels(): UiLabels {
  const { language } = useLanguage()
  return getUiLabels(language)
}
