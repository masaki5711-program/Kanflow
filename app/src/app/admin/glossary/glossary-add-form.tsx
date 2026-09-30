"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch } from "@/hooks"
import { Button, Field, Input, useToast } from "@/components/ui"
import type { TranslationLocale } from "@/lib/translation/types"

interface Props {
  source: TranslationLocale
  onAdded: () => void
}

/** New glossary pair (term in the source language → translation). */
export function GlossaryAddForm({ source, onAdded }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [term, setTerm] = useState("")
  const [translation, setTranslation] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const targetLabel = source === "ja" ? t.glossaryLangId : t.glossaryLangJa
  const sourceLabel = source === "ja" ? t.glossaryLangJa : t.glossaryLangId

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!term.trim() || !translation.trim() || busy) return
    setBusy(true)
    try {
      await apiFetch("/api/admin/glossary", {
        method: "POST",
        json: {
          sourceLocale: source,
          targetLocale: source === "ja" ? "id" : "ja",
          term: term.trim(),
          translation: translation.trim(),
          note: note.trim() || null,
        },
      })
      setTerm("")
      setTranslation("")
      setNote("")
      toast.success(t.glossaryAdded)
      onAdded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={add} className="grid gap-3 border-b border-border bg-surface-muted p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <Field label={`${t.glossaryColTerm} (${sourceLabel})`} required>
        <Input inputSize="sm" value={term} onChange={(e) => setTerm(e.target.value)} required lang={source} />
      </Field>
      <Field label={`${t.glossaryColTranslation} (${targetLabel})`} required>
        <Input inputSize="sm" value={translation} onChange={(e) => setTranslation(e.target.value)} required lang={source === "ja" ? "id" : "ja"} />
      </Field>
      <Field label={t.glossaryColNote}>
        <Input inputSize="sm" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" size="sm" leftIcon={<Plus className="h-4 w-4" />} loading={busy} disabled={!term.trim() || !translation.trim()}>
          {t.glossaryAdd}
        </Button>
      </div>
    </form>
  )
}
