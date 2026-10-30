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
import { API_TOKEN_SCOPES, API_TOKEN_SCOPE_PRESETS, normalizeScopes, type ApiTokenScope } from "@/lib/api-tokens/scopes"
import type { ApiTokensTranslations } from "@/lib/i18n/api-tokens"
import { useLanguage } from "@/lib/language-context"
import { ApiUsageHelp } from "./api-usage-help"

const URL_BASE = "/api/user/api-tokens"
const NO_EXPIRY = "none"

const SCOPE_LABEL: Record<ApiTokenScope, keyof ApiTokensTranslations> = {
  read: "apiTokenScopeRead",
  "backlog:write": "apiTokenScopeBacklogWrite",
  "backlog:reorder": "apiTokenScopeBacklogReorder",
  "sprint:write": "apiTokenScopeSprintWrite",
  "task:write": "apiTokenScopeTaskWrite",
  "comment:write": "apiTokenScopeCommentWrite",
  "icebox:write": "apiTokenScopeIceboxWrite",
  "daily:write": "apiTokenScopeDailyWrite",
  "dev:write": "apiTokenScopeDevWrite",
}

const PRESETS: { key: keyof typeof API_TOKEN_SCOPE_PRESETS; label: keyof ApiTokensTranslations }[] = [
  { key: "readOnly", label: "apiTokenPresetReadOnly" },
  { key: "developer", label: "apiTokenPresetDeveloper" },
  { key: "all", label: "apiTokenPresetAll" },
]

/** `/me`: create, list and revoke personal access tokens for the REST API and the Kanflow MCP. */
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
      projectIds: tok.projectIds,
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
        <ApiUsageHelp />
      </div>

      {query.isLoading || !data ? (
        <SkeletonCard label={t.loading} />
      ) : (
        <>
          {created ? (
            <CreatedTokenPanel token={created} onDone={() => setCreated(null)} />
          ) : data.config.enabled ? (
            <CreateTokenForm config={data.config} projects={data.projects} activeCount={data.tokens.filter((x) => x.state === "active").length} onCreated={handleCreated} />
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
  projects: OwnApiTokens["projects"]
  activeCount: number
  onCreated: (token: CreatedApiToken) => void
}

interface CreateTokenBody {
  name: string
  expiresInDays: number | null
  scopes: ApiTokenScope[]
  projectIds: string[] | null
}

function CreateTokenForm({ config, projects, activeCount, onCreated }: CreateFormProps) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState(String(config.expiryDays[0] ?? 30))
  const [scopes, setScopes] = useState<ApiTokenScope[]>(["read"])
  const [limitProjects, setLimitProjects] = useState(false)
  const [projectIds, setProjectIds] = useState<string[]>([])
  const create = useApiMutation(
    (body: CreateTokenBody) => apiFetch<CreatedApiToken>(URL_BASE, { method: "POST", json: body }),
    { toastOnSuccess: t.apiTokenCreated, toastOnError: (e) => `${t.apiTokenCreateFailed}: ${e.message}` }
  )
  const atLimit = activeCount >= config.maxPerUser
  const missingProjects = limitProjects && projectIds.length === 0

  function toggleScope(scope: ApiTokenScope, on: boolean) {
    setScopes((prev) => normalizeScopes(on ? [...prev, scope] : prev.filter((s) => s !== scope)))
  }

  function toggleProject(id: string, on: boolean) {
    setProjectIds((prev) => (on ? [...prev, id] : prev.filter((p) => p !== id)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || atLimit || missingProjects || create.isPending) return
    const result = await create.mutate({
      name: trimmed,
      expiresInDays: expiry === NO_EXPIRY ? null : Number(expiry),
      scopes,
      projectIds: limitProjects ? projectIds : null,
    })
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

      <fieldset disabled={atLimit} className="space-y-2">
        <legend className="text-body font-medium text-fg">{t.apiTokenScopes}</legend>
        <p className="text-caption text-fg-muted">{t.apiTokenScopesHint}</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.key} type="button" variant="secondary" size="sm" onClick={() => setScopes([...API_TOKEN_SCOPE_PRESETS[p.key]])}>
              {t[p.label]}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {API_TOKEN_SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-body text-fg">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={scopes.includes(scope)}
                disabled={scope === "read"}
                onChange={(e) => toggleScope(scope, e.target.checked)}
              />
              <span>{t[SCOPE_LABEL[scope]]}</span>
              <code className="text-caption text-fg-muted">{scope}</code>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={atLimit} className="space-y-2">
        <legend className="text-body font-medium text-fg">{t.apiTokenProjects}</legend>
        <label className="flex items-center gap-2 text-body text-fg">
          <input type="radio" name="api-token-projects" className="h-4 w-4" checked={!limitProjects} onChange={() => setLimitProjects(false)} />
          {t.apiTokenProjectsAll}
        </label>
        <label className="flex items-center gap-2 text-body text-fg">
          <input type="radio" name="api-token-projects" className="h-4 w-4" checked={limitProjects} onChange={() => setLimitProjects(true)} />
          {t.apiTokenProjectsSelected}
        </label>
        {limitProjects &&
          (projects.length === 0 ? (
            <p className="text-caption text-fg-muted">{t.apiTokenProjectsEmpty}</p>
          ) : (
            <div role="group" aria-label={t.apiTokenProjectsSelected} className="max-h-48 space-y-1 overflow-y-auto rounded-ui-md border border-border p-2">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-body text-fg">
                  <input type="checkbox" className="h-4 w-4" checked={projectIds.includes(p.id)} onChange={(e) => toggleProject(p.id, e.target.checked)} />
                  <span className="break-all">{p.name}</span>
                </label>
              ))}
            </div>
          ))}
        {missingProjects && (
          <p role="status" className="text-caption text-warning">
            {t.apiTokenProjectsPickOne}
          </p>
        )}
      </fieldset>

      {atLimit && (
        <p role="status" className="text-caption text-warning">
          {t.apiTokenLimitReached.replace("{max}", String(config.maxPerUser))}
        </p>
      )}
      <Button type="submit" loading={create.isPending} disabled={atLimit || !name.trim() || missingProjects} leftIcon={<KeyRound aria-hidden className="h-4 w-4" />}>
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
            <p className="mt-1 flex flex-wrap gap-1">
              {tok.scopes.map((scope) => (
                <code key={scope} className="rounded bg-surface-muted px-1.5 py-0.5 text-caption text-fg-muted">
                  {scope}
                </code>
              ))}
              {tok.projectIds && <Badge>{t.apiTokenProjectCount.replace("{count}", String(tok.projectIds.length))}</Badge>}
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
