"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, LayoutTemplate, Plus, Search } from "lucide-react"
import { Badge, Input, PageHeader, SkeletonCard, buttonClasses } from "@/components/ui"
import { useApiQuery, useDocumentTitle } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { TEMPLATES_API, groupTemplates, type PlanTemplateSummaryDto } from "@/components/plan-templates/template-groups"

function TemplateCard({ tpl }: { tpl: PlanTemplateSummaryDto }) {
  const { t, language } = useLanguage()
  const date = new Date(tpl.updatedAt).toLocaleDateString(language)
  return (
    <li>
      <Link
        href={`/templates/${tpl.id}`}
        data-template-card={tpl.id}
        className="flex h-full flex-col gap-1.5 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm transition-colors hover:border-primary/50 hover:bg-primary-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-body font-semibold text-fg">{tpl.name}</span>
          {tpl.isBuiltin && <Badge tone="info">{t.tplBuiltinBadge}</Badge>}
          {tpl.visibility === "private" && <Badge>{t.tplPrivateBadge}</Badge>}
        </span>
        {tpl.description && <span className="line-clamp-2 text-caption text-fg-muted">{tpl.description}</span>}
        <span className="mt-auto flex flex-wrap gap-x-3 pt-1 text-caption text-fg-subtle">
          <span>{fillTemplate(t.tplStageCount, { n: tpl.stageCount })}</span>
          {tpl.owner && !tpl.isMine && <span>{fillTemplate(t.tplOwnerLabel, { name: tpl.owner.name ?? t.tplUnknownUser })}</span>}
          {tpl.updatedByName && <span>{fillTemplate(t.tplUpdatedBy, { date, name: tpl.updatedByName })}</span>}
        </span>
      </Link>
    </li>
  )
}

/** /templates: every template the user can see, grouped 共通 / 自分 / みんな, with search and "new". */
export function TemplatesLibrary() {
  const { t } = useLanguage()
  const router = useRouter()
  useDocumentTitle([t.tplLibraryTitle])
  const [query, setQuery] = useState("")
  /** Back to where the user came from (the plan); home when the page was opened directly. */
  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/"))
  const list = useApiQuery<PlanTemplateSummaryDto[]>(TEMPLATES_API, { toastOnError: true })
  const groups = groupTemplates(list.data ?? [], query)
  const sections = [
    { key: "builtin", title: t.tplSectionBuiltin, items: groups.builtin },
    { key: "mine", title: t.tplSectionMine, items: groups.mine },
    { key: "shared", title: t.tplSectionShared, items: groups.shared },
  ]

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex min-h-8 items-center gap-1 text-caption font-medium text-primary hover:underline"
        data-testid="tpl-library-back"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t.tplBackPrev}
      </button>
      <PageHeader
        title={t.tplLibraryTitle}
        description={t.tplLibraryDesc}
        icon={
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-ui-md bg-primary-soft text-primary-strong">
            <LayoutTemplate className="h-5 w-5" />
          </span>
        }
        actions={
          <Link href="/templates/new" className={buttonClasses({ size: "sm" })} data-testid="tpl-new">
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t.tplNew}
          </Link>
        }
      />
      <div className="relative max-w-md">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.tplSearch} aria-label={t.tplSearch} className="pl-8" />
      </div>
      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.key} aria-labelledby={`tpl-lib-${s.key}`} className="space-y-2">
            <h2 id={`tpl-lib-${s.key}`} className="text-body font-semibold text-fg">
              {s.title} <span className="font-normal text-fg-muted">({s.items.length})</span>
            </h2>
            {s.items.length === 0 ? (
              <p className="text-caption text-fg-muted">{query ? t.tplNoMatches : t.tplNoTemplates}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {s.items.map((tpl) => (
                  <TemplateCard key={tpl.id} tpl={tpl} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  )
}
