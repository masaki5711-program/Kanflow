"use client"

import { useState, type FormEvent } from "react"
import { CheckCircle2, Plus, XCircle } from "lucide-react"
import { Button, Field, Input } from "@/components/ui"
import { apiFetch, useApiMutation, useUnsavedChangesGuard } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { serverErrorText } from "../git/git-labels"
import { MIN_TOKEN_LENGTH } from "./git-token-field"

/** POST /git/test response. */
export interface ConnectionTestResult {
  ok: boolean
  repository?: { path: string; webUrl: string; defaultBranch: string | null; externalId: number }
  error?: string
}

interface Draft {
  name: string
  url: string
  useOwnToken: boolean
  token: string
}

const EMPTY: Draft = { name: "", url: "", useOwnToken: false, token: "" }

interface Props {
  projectId: string
  /** Whether the integration token is set (otherwise a per-repository token is required). */
  hasToken: boolean
  onAdded: () => void
}

/** 表示名 + URL (+ optional own token), with a connection test before adding. */
export function GitAddRepository({ projectId, hasToken, onAdded }: Props) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [test, setTest] = useState<ConnectionTestResult | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  useUnsavedChangesGuard(draft.name !== "" || draft.url !== "" || draft.token !== "")

  const token = draft.useOwnToken ? draft.token.trim() : ""
  const tokenMissing = draft.useOwnToken ? token.length < MIN_TOKEN_LENGTH : !hasToken
  const canTest = draft.url.trim() !== "" && !tokenMissing
  const canAdd = canTest && draft.name.trim() !== ""
  const base = `/api/projects/${projectId}/git`

  /** URL / token edits invalidate the last test result and error. */
  const update = (patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    if ("url" in patch || "token" in patch || "useOwnToken" in patch) setTest(null)
    setAddError(null)
  }

  const runTest = useApiMutation(
    () => apiFetch<ConnectionTestResult>(`${base}/test`, { method: "POST", json: { url: draft.url.trim(), ...(token ? { token } : {}) } }),
    {
      onSuccess: setTest,
      onError: (e) => setTest({ ok: false, error: serverErrorText(e, e.message) }),
    },
  )

  const add = useApiMutation(
    () =>
      apiFetch(`${base}/repositories`, {
        method: "POST",
        json: { name: draft.name.trim(), url: draft.url.trim(), ...(token ? { token } : {}) },
      }),
    {
      onSuccess: () => {
        setDraft(EMPTY)
        setTest(null)
        onAdded()
      },
      // The refusal reason (URL not recognised, token cannot see it, limit, duplicate) is shown under the form.
      onError: (e) => setAddError(serverErrorText(e, t.gitSetAddFailed)),
      toastOnSuccess: t.gitSetAdded,
    },
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canAdd || add.isPending) return
    void add.mutate(undefined)
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-ui-md border border-dashed border-border-strong p-4">
      <h3 className="text-body font-semibold text-fg">{t.gitSetAddTitle}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label={t.gitSetAddName}>
          <Input value={draft.name} maxLength={100} placeholder={t.gitSetAddNamePlaceholder} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label={t.gitSetAddUrl} hint={t.gitSetAddUrlHint}>
          <Input
            type="url"
            inputMode="url"
            value={draft.url}
            maxLength={1000}
            spellCheck={false}
            placeholder={t.gitSetAddUrlPlaceholder}
            onChange={(e) => update({ url: e.target.value })}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-body text-fg">
        <input
          type="checkbox"
          checked={draft.useOwnToken}
          onChange={(e) => update({ useOwnToken: e.target.checked, token: "" })}
          className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
        />
        {t.gitSetAddOwnToken}
      </label>
      {draft.useOwnToken && (
        <Field label={t.gitSetAddOwnTokenLabel} error={token !== "" && token.length < MIN_TOKEN_LENGTH ? t.gitSetTokenTooShort : undefined}>
          <Input type="password" autoComplete="off" spellCheck={false} maxLength={200} value={draft.token} onChange={(e) => update({ token: e.target.value })} />
        </Field>
      )}
      {!hasToken && !draft.useOwnToken && <p className="text-caption text-warning">{t.gitSetNeedToken}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" loading={runTest.isPending} disabled={!canTest} onClick={() => void runTest.mutate(undefined)}>
          {t.gitSetAddTest}
        </Button>
        <Button type="submit" loading={add.isPending} disabled={!canAdd} leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
          {t.gitSetAddSubmit}
        </Button>
      </div>

      <div role="status" aria-live="polite">
        {test && <TestResult result={test} />}
      </div>
      {addError && (
        <p role="alert" className="flex items-start gap-1.5 text-caption font-medium text-danger">
          <XCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{addError}</span>
        </p>
      )}
    </form>
  )
}

function TestResult({ result }: { result: ConnectionTestResult }) {
  const { t } = useLanguage()
  if (result.ok && result.repository) {
    const text = fillTemplate(t.gitSetAddTestOk, {
      path: result.repository.path,
      branch: result.repository.defaultBranch ?? t.gitSetAddTestNoBranch,
    })
    return (
      <p className="flex items-start gap-1.5 text-caption font-medium text-success">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="break-words">{text}</span>
      </p>
    )
  }
  return (
    <p className="flex items-start gap-1.5 text-caption font-medium text-danger">
      <XCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="break-words">{fillTemplate(t.gitSetAddTestFailed, { error: result.error ?? "" })}</span>
    </p>
  )
}
