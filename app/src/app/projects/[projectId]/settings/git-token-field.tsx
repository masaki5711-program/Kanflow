"use client"

import { useState, type FormEvent } from "react"
import { KeyRound } from "lucide-react"
import { Button, Field, Input, useConfirm, useToast } from "@/components/ui"
import { useUnsavedChangesGuard } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"

/** Same bound as the server (git.service tokenField). */
export const MIN_TOKEN_LENGTH = 8

interface Props {
  hasToken: boolean
  tokenHint: string | null
  canConfigure: boolean
  /** string = replace, null = remove. Rejects on failure (the caller already toasts). */
  onSave: (token: string | null) => Promise<unknown>
}

/**
 * The integration access token. Write-only: the saved token is never sent
 * back, so the field is always empty and only the last characters are shown.
 */
export function GitTokenField({ hasToken, tokenHint, canConfigure, onSave }: Props) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)
  useUnsavedChangesGuard(value !== "")

  const trimmed = value.trim()
  const tooShort = trimmed !== "" && trimmed.length < MIN_TOKEN_LENGTH
  const showInput = canConfigure && (editing || !hasToken)
  const status = hasToken ? fillTemplate(t.gitSetTokenSet, { hint: tokenHint ?? "" }) : t.gitSetTokenNone

  async function run(token: string | null, successMessage: string) {
    setSaving(true)
    try {
      await onSave(token)
      toast.success(successMessage)
      setValue("")
      setEditing(false)
    } catch {
      // The settings mutation already showed the error toast; keep the input for a retry.
    } finally {
      setSaving(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (trimmed.length < MIN_TOKEN_LENGTH || saving) return
    void run(trimmed, t.gitSetTokenSaved)
  }

  async function remove() {
    const ok = await confirm({ title: t.gitSetTokenRemoveTitle, message: t.gitSetTokenRemoveMessage, confirmLabel: t.gitSetTokenRemove, variant: "danger" })
    if (ok) void run(null, t.gitSetTokenRemoved)
  }

  return (
    <div className="space-y-2 rounded-ui-md border border-border bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-body font-semibold text-fg">
          <KeyRound aria-hidden="true" className="h-4 w-4 text-fg-muted" />
          {t.gitSetToken}
        </h3>
        <span className={hasToken ? "text-caption font-medium text-success" : "text-caption text-fg-muted"}>{status}</span>
      </div>
      {canConfigure && <p className="text-caption text-fg-muted">{t.gitSetTokenHelp}</p>}

      {showInput ? (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start" noValidate>
          <Field
            label={t.gitSetToken}
            hideLabel
            error={tooShort ? t.gitSetTokenTooShort : undefined}
            className="min-w-0 flex-1"
          >
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              maxLength={200}
              placeholder="glpat-…"
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <div className="flex shrink-0 gap-2">
            <Button type="submit" loading={saving} disabled={trimmed.length < MIN_TOKEN_LENGTH}>
              {t.gitSetTokenSave}
            </Button>
            {hasToken && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                  setValue("")
                }}
              >
                {t.cancel}
              </Button>
            )}
          </div>
        </form>
      ) : (
        canConfigure &&
        hasToken && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {t.gitSetTokenChange}
            </Button>
            <Button variant="ghost" size="sm" loading={saving} onClick={() => void remove()} className="text-danger hover:text-danger">
              {t.gitSetTokenRemove}
            </Button>
          </div>
        )
      )}
    </div>
  )
}
