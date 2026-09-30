"use client"

import { useState } from "react"
import { Check, Copy, KeyRound, Trash2 } from "lucide-react"
import { Badge, Button, Field, Input, Select, SkeletonCard, useConfirm, useToast } from "@/components/ui"
import {
  formatTokenDate,
  type ApiTokenView,
  type CreatedApiToken,
  type OwnApiTokens,
} from "@/components/api-tokens/api-token-types"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"

const URL_BASE = "/api/user/api-tokens"
const NO_EXPIRY = "none"

/** `/me`: create, list and revoke personal access tokens for the read-only REST API. */
export function ApiTokensSection() {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const query = useApiQuery<OwnApiTokens>(URL_BASE, { toastOnError: (e) => `${t.apiTokenLoadFailed}: ${e.message}` })
  const { data, mutate: setData } = query
  const [created, setCreated] = useState<CreatedApiToken | null>(null)

  const revoke = useApiMutation((tok: ApiTokenView) => apiFetch(`${URL_BASE}/${tok.id}`, { method: "DELETE" }), {
    onMutate: (tok) => {
      const prev = data
      setData((d) => (d ? { ...d, tokens: d.tokens.filter((x) => x.id !== tok.id) } : d))
      return prev
    },
    rollback: (prev) => setData(prev),
    toastOnSuccess: t.apiTokenRevoked,
    toastOnError: (e) => `${t.apiTokenRevokeFailed}: ${e.message}`,
  })

  async function handleRevoke(tok: ApiTokenView) {
    const ok = await confirm({
      title: t.apiTokenRevokeTitle,
      message: t.apiTokenRevokeMessage.replace("{name}", tok.name),
      confirmLabel: t.apiTokenRevoke,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (ok) void revoke.mutate(tok)
  }

  function handleCreated(tok: CreatedApiToken) {
    setCreated(tok)
    // The list never holds the plain token (only the panel above does, until dismissed).
    const view: ApiTokenView = {
      id: tok.id,
      name: tok.name,
      prefix: tok.prefix,
      scopes: tok.scopes,
      createdAt: tok.createdAt,
      lastUsedAt: tok.lastUsedAt,
      expiresAt: tok.expiresAt,
      state: tok.state,
    }
    setData((d) => (d ? { ...d, tokens: [view, ...d.tokens] } : d))
  }

  return (
    <section aria-labelledby="profile-api-tokens" className="bg-surface rounded-ui-lg border border-border shadow-ui-sm p-6 space-y-4">
      <div>
        <h2 id="profile-api-tokens" className="flex items-center gap-2 text-body font-semibold text-fg-muted uppercase tracking-wider">
          <KeyRound aria-hidden className="h-4 w-4" />
          {t.apiTokenSectionTitle}
        </h2>
        <p className="mt-2 text-caption text-fg-muted">{t.apiTokenSectionHint}</p>
        <p className="mt-1 text-caption text-fg-subtle">{t.apiTokenDocsLink}</p>
      </div>

      {query.isLoading || !data ? (
        <SkeletonCard label={t.loading} />
      ) : (
        <>
          {created ? (
            <CreatedTokenPanel token={created} onDone={() => setCreated(null)} />
          ) : data.config.enabled ? (
            <CreateTokenForm config={data.config} activeCount={data.tokens.filter((x) => x.state === "active").length} onCreated={handleCreated} />
          ) : (
            <p role="status" className="rounded-ui-md bg-warning-soft px-3 py-2 text-body text-fg">
              {t.apiTokenDisabled}
            </p>
          )}
          <TokenList tokens={data.tokens} busy={revoke.isPending} onRevoke={(tok) => void handleRevoke(tok)} />
        </>
      )}
    </section>
  )
}

interface CreateFormProps {
  config: OwnApiTokens["config"]
  activeCount: number
  onCreated: (token: CreatedApiToken) => void
}

function CreateTokenForm({ config, activeCount, onCreated }: CreateFormProps) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState(String(config.expiryDays[0] ?? 30))
  const create = useApiMutation(
    (body: { name: string; expiresInDays: number | null }) => apiFetch<CreatedApiToken>(URL_BASE, { method: "POST", json: body }),
    { toastOnSuccess: t.apiTokenCreated, toastOnError: (e) => `${t.apiTokenCreateFailed}: ${e.message}` }
  )
  const atLimit = activeCount >= config.maxPerUser

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || atLimit || create.isPending) return
    const result = await create.mutate({ name: trimmed, expiresInDays: expiry === NO_EXPIRY ? null : Number(expiry) })
    if (result) {
      setName("")
      onCreated(result)
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label={t.apiTokenCreate} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_12rem]">
        <Field label={t.apiTokenName} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={t.apiTokenNamePlaceholder} required disabled={atLimit} />
        </Field>
        <Field label={t.apiTokenExpiry}>
          <Select value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={atLimit}>
            {config.expiryDays.map((d) => (
              <option key={d} value={String(d)}>
                {t.apiTokenExpiryDays.replace("{days}", String(d))}
              </option>
            ))}
            {config.allowNoExpiry && <option value={NO_EXPIRY}>{t.apiTokenExpiryNone}</option>}
          </Select>
        </Field>
      </div>
      {atLimit && (
        <p role="status" className="text-caption text-warning">
          {t.apiTokenLimitReached.replace("{max}", String(config.maxPerUser))}
        </p>
      )}
      <Button type="submit" loading={create.isPending} disabled={atLimit || !name.trim()} leftIcon={<KeyRound aria-hidden className="h-4 w-4" />}>
        {t.apiTokenCreate}
      </Button>
    </form>
  )
}

function CreatedTokenPanel({ token, onDone }: { token: CreatedApiToken; onDone: () => void }) {
  const { t } = useLanguage()
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(token.token)
      setCopied(true)
      toast.success(t.apiTokenCopied)
    } catch {
      toast.error(t.apiTokenCopyFailed)
    }
  }

  return (
    <div role="group" aria-labelledby="api-token-shown-once" className="space-y-3 rounded-ui-md border border-success bg-success-soft p-4">
      <p id="api-token-shown-once" role="status" className="text-body font-medium text-fg">
        {t.apiTokenShownOnce}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={token.token}
          aria-label={token.name}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-caption"
        />
        <Button
          variant="secondary"
          onClick={() => void copy()}
          leftIcon={copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
        >
          {t.apiTokenCopy}
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={onDone}>
        {t.apiTokenDone}
      </Button>
    </div>
  )
}

interface TokenListProps {
  tokens: ApiTokenView[]
  busy: boolean
  onRevoke: (token: ApiTokenView) => void
}

function TokenList({ tokens, busy, onRevoke }: TokenListProps) {
  const { t, language } = useLanguage()
  if (tokens.length === 0) return <p className="text-caption text-fg-muted">{t.apiTokenEmpty}</p>
  return (
    <ul aria-label={t.apiTokenListLabel} className="divide-y divide-border rounded-ui-md border border-border">
      {tokens.map((tok) => (
        <li key={tok.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-body font-medium text-fg">
              <span className="break-all">{tok.name}</span>
              <code className="rounded bg-surface-muted px-1.5 py-0.5 text-caption text-fg-muted">{tok.prefix}…</code>
              {tok.state === "expired" && <Badge tone="warning">{t.apiTokenStateExpired}</Badge>}
            </p>
            <p className="mt-0.5 text-caption text-fg-muted">
              {t.apiTokenColCreated}: {formatTokenDate(tok.createdAt, language)}
              {" · "}
              {t.apiTokenColLastUsed}: {tok.lastUsedAt ? formatTokenDate(tok.lastUsedAt, language, true) : t.apiTokenNever}
              {" · "}
              {t.apiTokenColExpires}: {tok.expiresAt ? formatTokenDate(tok.expiresAt, language) : t.apiTokenNoExpiry}
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => onRevoke(tok)}
            aria-label={`${t.apiTokenRevoke}: ${tok.name}`}
            leftIcon={<Trash2 aria-hidden className="h-4 w-4" />}
          >
            {t.apiTokenRevoke}
          </Button>
        </li>
      ))}
    </ul>
  )
}
