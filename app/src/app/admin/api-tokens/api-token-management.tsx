"use client"

import { KeyRound, Trash2 } from "lucide-react"
import { Badge, Button, EmptyState, PageHeader, SkeletonTable, useConfirm } from "@/components/ui"
import { formatTokenDate, type AdminApiTokens, type AdminApiTokenView } from "@/components/api-tokens/api-token-types"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"

const URL_BASE = "/api/admin/api-tokens"

/** Admin: every user's non-revoked personal access tokens, with revoke. */
export function ApiTokenManagement() {
  const { t, language } = useLanguage()
  const confirm = useConfirm()
  const query = useApiQuery<AdminApiTokens>(URL_BASE, { toastOnError: (e) => `${t.apiTokenLoadFailed}: ${e.message}` })
  const { data, mutate: setData } = query

  const revoke = useApiMutation((tok: AdminApiTokenView) => apiFetch(`${URL_BASE}/${tok.id}`, { method: "DELETE" }), {
    onMutate: (tok) => {
      const prev = data
      setData((d) => (d ? { ...d, tokens: d.tokens.filter((x) => x.id !== tok.id) } : d))
      return prev
    },
    rollback: (prev) => setData(prev),
    toastOnSuccess: t.apiTokenRevoked,
    toastOnError: (e) => `${t.apiTokenRevokeFailed}: ${e.message}`,
  })

  async function handleRevoke(tok: AdminApiTokenView) {
    const ok = await confirm({
      title: t.apiTokenRevokeTitle,
      message: t.apiTokenAdminRevokeMessage.replace("{name}", tok.name).replace("{owner}", tok.user.name),
      confirmLabel: t.apiTokenRevoke,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (ok) void revoke.mutate(tok)
  }

  return (
    <div>
      <PageHeader title={t.apiTokenAdminTitle} description={t.apiTokenAdminDescription} />
      {data && !data.enabled && (
        <p role="status" className="mb-4 rounded-ui-md bg-warning-soft px-3 py-2 text-body text-fg">
          {t.apiTokenDisabled}
        </p>
      )}
      {query.isLoading ? (
        <SkeletonTable />
      ) : !data || data.tokens.length === 0 ? (
        <EmptyState icon={<KeyRound className="h-6 w-6" />} title={t.apiTokenAdminEmpty} headingLevel={2} />
      ) : (
        <div className="relative overflow-x-auto rounded-ui-lg border border-border bg-surface">
          <table className="w-full text-body">
            <caption className="sr-only">{t.apiTokenAdminTitle}</caption>
            <thead className="bg-surface-muted text-left text-caption text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t.apiTokenColOwner}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.apiTokenName}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.apiTokenColPrefix}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.apiTokenColCreated}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.apiTokenColLastUsed}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.apiTokenColExpires}</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">{t.apiTokenRevoke}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.tokens.map((tok) => (
                <tr key={tok.id}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-fg">{tok.user.name}</span>
                    <span className="block text-caption text-fg-muted break-all">{tok.user.email}</span>
                    {!tok.user.isActive && <Badge tone="neutral">{t.apiTokenOwnerInactive}</Badge>}
                  </td>
                  <td className="px-3 py-2 break-all">{tok.name}</td>
                  <td className="px-3 py-2"><code className="text-caption text-fg-muted">{tok.prefix}…</code></td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatTokenDate(tok.createdAt, language)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{tok.lastUsedAt ? formatTokenDate(tok.lastUsedAt, language, true) : t.apiTokenNever}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {tok.state === "expired" ? (
                      <Badge tone="warning">{t.apiTokenStateExpired}</Badge>
                    ) : tok.expiresAt ? (
                      formatTokenDate(tok.expiresAt, language)
                    ) : (
                      t.apiTokenNoExpiry
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => void handleRevoke(tok)}
                      aria-label={`${t.apiTokenRevoke}: ${tok.name} (${tok.user.name})`}
                      leftIcon={<Trash2 aria-hidden className="h-4 w-4" />}
                    >
                      {t.apiTokenRevoke}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
