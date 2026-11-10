"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { ExternalLink, Link2, Link2Off, Search } from "lucide-react"
import { apiFetch, isApiError, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { useLanguage } from "@/lib/language-context"
import { Badge, Button, buttonClasses, Input, SkeletonLines, useToast, VisuallyHidden } from "@/components/ui"

/** One repository bound to the project in GitStation (GET /git/repo-bindings). */
export interface RepoBinding {
  bindingId: number
  repositoryId: number
  path: string | null
  resolvesWorkItems: boolean
  listed: boolean
  url: string | null
}

export type RepoBindings = { supported: false; reason: string } | { supported: true; canAct: boolean; items: RepoBinding[] }

interface FoundRepository {
  id: number
  path: string
  displayName: string
}

/** What the person asked for, waiting for GitStation's confirmation. */
interface Pending {
  attemptId: string
  confirmUrl: string
  /** The repository's path, shown in the confirmation group. */
  path: string
  /** Where focus returns when the confirmation closes. */
  returnFocus: HTMLElement | null
}

type StartBody = { intent: "binding_set"; repositoryId: number; resolvesWorkItems: boolean } | { intent: "binding_remove"; bindingId: number }

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0

/** Response → bindings; anything malformed reads as "not supported" so a bad body never offers a write. */
export function toRepoBindings(raw: unknown): RepoBindings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  if (r.supported !== true || !Array.isArray(r.items)) return { supported: false, reason: typeof r.reason === "string" ? r.reason : "off" }
  const items = r.items.flatMap((i): RepoBinding[] => {
    if (!i || typeof i !== "object") return []
    const b = i as Record<string, unknown>
    if (!isId(b.bindingId) || !isId(b.repositoryId) || typeof b.resolvesWorkItems !== "boolean") return []
    return [{ bindingId: b.bindingId, repositoryId: b.repositoryId, path: typeof b.path === "string" ? b.path : null, resolvesWorkItems: b.resolvesWorkItems, listed: b.listed === true, url: typeof b.url === "string" ? b.url : null }]
  })
  return { supported: true, canAct: r.canAct === true, items }
}

function toFound(raw: unknown): FoundRepository[] {
  const items = raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : []
  return items.flatMap((i): FoundRepository[] => {
    if (!i || typeof i !== "object") return []
    const r = i as Record<string, unknown>
    return isId(r.id) && typeof r.path === "string" && typeof r.displayName === "string" ? [{ id: r.id, path: r.path, displayName: r.displayName }] : []
  })
}

interface Props {
  projectId: string
  /** PO / SM / admin ("git.bindRepository", the same people as git.configure). */
  canBind: boolean
  /** Kanflow's repository list changed (a bound repository was added to it). */
  onRepositoriesChanged: () => void
}

/**
 * GitStation のリポジトリの結びつけ (plan 11 §5.7 X3): the repositories bound to this project, a search of the
 * person's own (Maintainer+) repositories, and bind (code / shared specs) / change to code / unbind — each confirmed
 * on GitStation's page (a new window), then 確認しました here, exactly like K4's approvals. GitStation decides every
 * change again as the person. Shown for a GitStation project to the people who may bind (PO / SM).
 */
export function GitRepoBindings({ projectId, canBind, onRepositoriesChanged }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const base = `/api/projects/${encodeURIComponent(projectId)}/git/repo-bindings`
  const query = useApiQuery<RepoBindings>(canBind ? base : null, { parse: toRepoBindings })
  const headingId = useId()
  const introId = useId()
  const kindsId = useId()
  const searchId = useId()
  const searchHelpId = useId()
  const groupId = useId()
  const confirmHelpId = useId()
  const [q, setQ] = useState("")
  const [found, setFound] = useState<FoundRepository[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const resultsRef = useRef<HTMLHeadingElement>(null)
  /** Bumped by each search that found something: focus moves to its results. */
  const [searchRound, setSearchRound] = useState(0)

  // A search that found repositories: focus its results heading (an empty one leaves focus in the field, the status says why).
  useEffect(() => {
    if (searchRound > 0) resultsRef.current?.focus()
  }, [searchRound])

  // The confirmation appears below the list: focus its first step.
  useEffect(() => {
    if (pending) linkRef.current?.focus()
  }, [pending])

  if (!canBind) return null
  const data = query.data
  if (!data) {
    if (query.isLoading) return <SkeletonLines lines={2} label={t.loading} />
    return (
      <div className="space-y-2">
        <p className="text-caption text-fg-muted">{t.gitBindLoadFailed}</p>
        <Button size="sm" variant="secondary" onClick={query.refetch}>{t.errorRetry}</Button>
      </div>
    )
  }
  // Not a GitStation project: nothing to bind (the repository list explains the source).
  if (!data.supported) {
    if (data.reason !== "config") return null
    return (
      <section aria-labelledby={headingId} className="space-y-1">
        <h3 id={headingId} className="text-body font-medium text-fg">{t.gitBindTitle}</h3>
        <p className="text-caption text-fg-muted">{t.gitBindUnsupportedConfig}</p>
      </section>
    )
  }
  const canAct = data.canAct
  const bindingOf = (repositoryId: number) => data.items.find((b) => b.repositoryId === repositoryId) ?? null
  const kindText = (resolves: boolean) => (resolves ? t.gitBindKindCode : t.gitBindKindShared)

  async function search(e: FormEvent) {
    e.preventDefault()
    const text = q.trim()
    if (!text || searching) return
    setSearching(true)
    try {
      const next = toFound(await apiFetch<unknown>(`${base}/search?q=${encodeURIComponent(text)}`))
      setFound(next)
      if (next.length > 0) setSearchRound((n) => n + 1)
    } catch (err) {
      toast.error(`${t.gitBindSearchFailed}: ${localizeApiError(err, t)}`)
    } finally {
      setSearching(false)
    }
  }

  async function start(body: StartBody, path: string, from: HTMLElement | null) {
    if (busy) return
    setBusy(true)
    setNote(null)
    try {
      const res = await apiFetch<{ attemptId: string; confirmUrl: string }>(`${base}/start`, { method: "POST", json: body })
      setPending({ attemptId: res.attemptId, confirmUrl: res.confirmUrl, path, returnFocus: from })
    } catch (err) {
      toast.error(`${t.gitBindStartFailed}: ${localizeApiError(err, t)}`)
      query.refetch()
    } finally {
      setBusy(false)
    }
  }

  function close() {
    const back = pending?.returnFocus
    setPending(null)
    setNote(null)
    // Back to the button that started it, or to the section when that button is gone.
    requestAnimationFrame(() => (back?.isConnected ? back : sectionRef.current)?.focus())
  }

  async function complete() {
    if (!pending || busy) return
    setBusy(true)
    // Cleared first so that the same note, given again, is announced again.
    setNote(null)
    try {
      const res = await apiFetch<{ outcome: string }>(`${base}/${encodeURIComponent(pending.attemptId)}/complete`, { method: "POST" })
      toast.success(res.outcome === "bound" ? t.gitBindBound : res.outcome === "updated" ? t.gitBindUpdated : res.outcome === "removed" ? t.gitBindRemoved : t.gitBindUnchanged)
      close()
      query.refetch()
    } catch (err) {
      // Not pressed in GitStation yet (or no answer at all): keep the confirmation open and say what to do.
      if (!isApiError(err) || err.code === "GIT_APPROVAL_NOT_CONFIRMED" || err.code === "GIT_APPROVAL_BUSY") {
        setNote(localizeApiError(err, t))
      } else {
        toast.error(`${t.gitBindFailed}: ${localizeApiError(err, t)}`)
        close()
        query.refetch()
      }
    } finally {
      setBusy(false)
    }
  }

  async function addToList(b: RepoBinding) {
    if (!b.url || !b.path || busy) return
    setBusy(true)
    try {
      await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/git/repositories`, { method: "POST", json: { name: b.path.slice(0, 100), url: b.url } })
      toast.success(t.gitBindAddedToList)
      onRepositoriesChanged()
      query.refetch()
    } catch (err) {
      toast.error(`${t.gitBindAddFailed}: ${localizeApiError(err, t)}`)
    } finally {
      setBusy(false)
    }
  }

  const locked = busy || pending !== null

  return (
    <section ref={sectionRef} tabIndex={-1} aria-labelledby={headingId} aria-describedby={introId} className="space-y-3 outline-none" data-git-repo-bindings>
      <h3 id={headingId} className="text-body font-medium text-fg">{t.gitBindTitle}</h3>
      <p id={introId} className="text-caption text-fg-muted">{t.gitBindIntro}</p>
      <p id={kindsId} className="text-caption text-fg-muted">{t.gitBindKindsHelp}</p>
      {!canAct && <p className="text-caption text-fg">{t.gitBindNoEmployeeNumber}</p>}

      <div className="space-y-1">
        <h4 className="text-caption font-medium text-fg">{t.gitBindBoundList}</h4>
        {data.items.length === 0 ? (
          <p className="text-caption text-fg-muted">{t.gitBindEmpty}</p>
        ) : (
          <ul className="divide-y divide-border rounded-ui-md border border-border">
            {data.items.map((b) => {
              const path = b.path ?? t.gitBindPathUnknown
              return (
                <li key={b.bindingId} className="flex flex-wrap items-center gap-2 px-3 py-2" data-binding-id={b.bindingId}>
                  <span className="min-w-0 flex-1 break-all text-body text-fg">{path}</span>
                  <Badge tone={b.resolvesWorkItems ? "info" : "neutral"} size="sm">{kindText(b.resolvesWorkItems)}</Badge>
                  {b.resolvesWorkItems && !b.listed && b.url && (
                    <span className="flex w-full flex-wrap items-center gap-2 text-caption text-fg-muted">
                      {t.gitBindNotListed}
                      <Button size="sm" variant="secondary" disabled={locked} aria-label={t.gitBindAddToListLabel.replace("{path}", path)} onClick={() => void addToList(b)}>
                        {t.gitBindAddToList}
                      </Button>
                    </span>
                  )}
                  {canAct && (
                    <span className="flex flex-wrap gap-2">
                      {!b.resolvesWorkItems && (
                        <Button size="sm" variant="ghost" disabled={locked} aria-label={t.gitBindMakeCodeLabel.replace("{path}", path)}
                          onClick={(e) => void start({ intent: "binding_set", repositoryId: b.repositoryId, resolvesWorkItems: true }, path, e.currentTarget)}>
                          {t.gitBindMakeCode}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={locked} leftIcon={<Link2Off className="h-3.5 w-3.5" />} aria-label={t.gitBindUnbindLabel.replace("{path}", path)}
                        onClick={(e) => void start({ intent: "binding_remove", bindingId: b.bindingId }, path, e.currentTarget)}>
                        {t.gitBindUnbind}
                      </Button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {canAct && (
        <form role="search" onSubmit={(e) => void search(e)} className="space-y-1">
          <label htmlFor={searchId} className="block text-caption font-medium text-fg">{t.gitBindSearchLabel}</label>
          <div className="flex flex-wrap items-center gap-2">
            <Input id={searchId} value={q} maxLength={100} spellCheck={false} autoComplete="off" aria-describedby={searchHelpId} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1" />
            <Button type="submit" variant="secondary" loading={searching} disabled={q.trim() === ""} leftIcon={<Search className="h-3.5 w-3.5" />}>
              {t.gitBindSearch}
            </Button>
          </div>
          <p id={searchHelpId} className="text-caption text-fg-muted">{t.gitBindSearchHelp}</p>
        </form>
      )}

      {/* Always mounted: only its text changes, so screen readers announce every search's result. */}
      <p role="status" className="text-caption text-fg-muted empty:hidden" data-git-bind-search-status>
        {canAct && found !== null ? (found.length === 0 ? t.gitBindSearchEmpty : t.gitBindSearchFound.replace("{count}", String(found.length))) : ""}
      </p>
      {canAct && found !== null && found.length > 0 && (
        <div className="space-y-1">
          <h4 ref={resultsRef} tabIndex={-1} className="text-caption font-medium text-fg outline-none">{t.gitBindSearchResults}</h4>
          {(
            <ul className="divide-y divide-border rounded-ui-md border border-border">
              {found.map((r) => {
                const bound = bindingOf(r.id)
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-repository-id={r.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block break-all text-body text-fg">{r.path}</span>
                      {r.displayName !== r.path && <span className="block text-caption text-fg-muted">{r.displayName}</span>}
                    </span>
                    {bound ? (
                      <span className="text-caption text-fg-muted">{t.gitBindAlready.replace("{kind}", kindText(bound.resolvesWorkItems))}</span>
                    ) : (
                      <span className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" disabled={locked} leftIcon={<Link2 className="h-3.5 w-3.5" />} aria-label={t.gitBindAsCodeLabel.replace("{path}", r.path)} aria-describedby={kindsId}
                          onClick={(e) => void start({ intent: "binding_set", repositoryId: r.id, resolvesWorkItems: true }, r.path, e.currentTarget)}>
                          {t.gitBindAsCode}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={locked} aria-label={t.gitBindAsSharedLabel.replace("{path}", r.path)} aria-describedby={kindsId}
                          onClick={(e) => void start({ intent: "binding_set", repositoryId: r.id, resolvesWorkItems: false }, r.path, e.currentTarget)}>
                          {t.gitBindAsShared}
                        </Button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {pending && (
        <div role="group" aria-labelledby={groupId} className="space-y-1.5 rounded-ui-sm border border-border bg-surface px-2 py-1.5" data-git-binding-confirm>
          <p id={groupId} className="text-caption font-medium text-fg">{t.gitBindConfirmGroup.replace("{path}", pending.path)}</p>
          <p id={confirmHelpId} className="text-caption text-fg-muted">{t.gitBindConfirmHelp}</p>
          <div className="flex flex-wrap items-center gap-2">
            {/* A user gesture on a real link: no pop-up blocker, and no opener for GitStation's page. */}
            <a ref={linkRef} href={pending.confirmUrl} aria-describedby={confirmHelpId} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              {t.gitDevConfirmOpen}{" "}
              <VisuallyHidden>{t.gitDevConfirmNewWindow}</VisuallyHidden>
            </a>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void complete()}>{t.gitDevConfirmDone}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={close}>{t.gitDevConfirmCancel}</Button>
          </div>
        </div>
      )}
      {/* Always mounted (outside the confirmation, which comes and goes): "not confirmed yet" is announced each time. */}
      <p role="status" className="text-caption text-fg empty:hidden" data-git-bind-confirm-status>{note ?? ""}</p>
    </section>
  )
}
