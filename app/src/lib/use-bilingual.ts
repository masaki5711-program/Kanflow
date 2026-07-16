"use client"

import { useState, useCallback } from "react"
import { streamTranslate } from "@/lib/streaming-translate"

/**
 * View-mode bilingualize hook. Stores the translated text in component state
 * so it's automatically discarded when the consumer (modal / card / page) unmounts.
 * Never mutates the source data — purely a presentation toggle.
 */
export function useBilingual(originalValue: string | null | undefined) {
  const [translated, setTranslated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const toggle = useCallback(async () => {
    if (!originalValue || !originalValue.trim()) return
    if (translated) {
      setTranslated(null)
      setError(false)
      return
    }
    setLoading(true)
    setError(false)
    try {
      // Stream the response and update the UI on every chunk so the user
      // sees the translation type out in real time.
      await streamTranslate(originalValue.trim(), (acc) => setTranslated(acc))
    } catch {
      setError(true)
      setTranslated(null)
    } finally {
      setLoading(false)
    }
  }, [originalValue, translated])

  return {
    display: translated ?? originalValue ?? "",
    isTranslated: translated !== null,
    loading,
    error,
    toggle,
    canBilingualize: !!(originalValue && originalValue.trim()),
  }
}
