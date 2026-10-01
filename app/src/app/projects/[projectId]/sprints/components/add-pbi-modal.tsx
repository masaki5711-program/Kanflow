"use client"

import { useMemo, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import PbiDetailModal from "@/components/pbi-detail-modal"
import { GlossaryHint, I18nText } from "@/components/i18n-text"
import { Button, EmptyState, Field, IconButton, Input, Modal, SkeletonLines, Textarea, Truncate, cn, useModalClose } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { pickText } from "@/lib/translation/pick-text"
import { PbiWaitingChip } from "@/components/pbi-dependencies/pbi-dependency-chips"
import type { BacklogItemDto, PbiWithStatusDto } from "@/types/api"

export type BacklogPbi = PbiWithStatusDto & Partial<Pick<BacklogItemDto, "productGoal" | "blockedBy" | "blocking">>

interface Props {
  projectId: string
  sprintId: string
  sprintName: string
  existingPbIds: Set<string>
  pointUnit: string
  /** PO/SM/admin can create brand-new PBIs from this modal. Others get the
   *  "pick from backlog" tab only. */
  canCreate?: boolean
  onAdded: () => void
  onClose: () => void
}

interface NewPbiForm {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
  workloadScore: string
  assignedPo: string
}

type Tab = "existing" | "new"

const EMPTY_NEW: NewPbiForm = {
  initiative: "",
  epic: "",
  userStory: "",
  acceptanceCriteria: "",
  workloadScore: "3",
  assignedPo: "",
}

function isNewFormDirty(f: NewPbiForm): boolean {
  return (Object.keys(f) as (keyof NewPbiForm)[]).some((k) => f[k] !== EMPTY_NEW[k])
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
      <path fillRule="evenodd" d="M.664 10.59a1.65 1.65 0 010-1.186A10 10 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10 10 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  )
}

export default function AddPbiModal({ projectId, sprintId, sprintName, existingPbIds, pointUnit, canCreate, onAdded, onClose }: Props) {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>("existing")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [detailPbiId, setDetailPbiId] = useState<string | null>(null)
  const [newForm, setNewForm] = useState<NewPbiForm>(EMPTY_NEW)
  const isDirty = selected.size > 0 || isNewFormDirty(newForm)

  const backlog = useApiQuery<{ readyItems?: BacklogPbi[] }>(`/api/projects/${projectId}/backlog`, { toastOnError: true })
  const items = useMemo(() => backlog.data?.readyItems ?? [], [backlog.data])
  const attachUrl = `/api/projects/${projectId}/sprints/${sprintId}/pbis`

  const attach = useApiMutation((pbIds: string[]) => apiFetch(attachUrl, { method: "POST", json: { pbIds } }), {
    onSuccess: () => {
      onAdded()
      onClose()
    },
    toastOnError: true,
  })

  const createAndAttach = useApiMutation(
    async (f: NewPbiForm) => {
      // Step 1: create the PBI with status=ready so it shows up in the active
      // backlog list and qualifies for sprint attachment.
      const created = await apiFetch<{ id: string }>(`/api/projects/${projectId}/backlog`, {
        method: "POST",
        json: {
          initiative: f.initiative.trim() || null,
          epic: f.epic.trim() || null,
          userStory: f.userStory.trim() || null,
          acceptanceCriteria: f.acceptanceCriteria.trim() || null,
          workloadScore: parseInt(f.workloadScore || "0", 10),
          assignedPo: f.assignedPo.trim() || null,
          status: "ready",
        },
      })
      // Step 2: attach it to the sprint.
      await apiFetch(attachUrl, { method: "POST", json: { pbIds: [created.id] } })
    },
    {
      onSuccess: () => {
        onAdded()
        onClose()
      },
      toastOnError: true,
    },
  )

  const eligible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (existingPbIds.has(it.id)) return false
      if (q.length === 0) return true
      const hay = [`#${it.displayId}`, it.initiative ?? "", it.epic ?? "", it.userStory ?? "", it.productGoal?.title ?? ""]
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, existingPbIds, query])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const saving = attach.isPending || createAndAttach.isPending
  const canSubmitNew = !!(newForm.userStory.trim() || newForm.initiative.trim())
  const submitDisabled = tab === "existing" ? selected.size === 0 : !canSubmitNew

  function handleSubmit() {
    if (saving) return
    if (tab === "existing") {
      if (selected.size > 0) void attach.mutate(Array.from(selected))
    } else if (canSubmitNew) {
      void createAndAttach.mutate(newForm)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t.sprintAddPbiTitle}
      description={sprintName}
      isDirty={isDirty && !saving}
      footer={
        <Footer
          selectedCount={tab === "existing" ? selected.size : null}
          saving={saving}
          disabled={submitDisabled}
          onSubmit={handleSubmit}
        />
      }
    >
      {canCreate && <TabSwitch tab={tab} onChange={setTab} />}

      {tab === "existing" ? (
        <>
          <div className="relative mb-3">
            <SearchIcon />
            <Input
              type="search"
              aria-label={t.sprintAddPbiSearchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.sprintAddPbiSearchPlaceholder}
              className="pl-9"
            />
          </div>
          {backlog.isLoading ? (
            <SkeletonLines lines={5} label={t.loading} />
          ) : eligible.length === 0 ? (
            <EmptyState compact title={items.length === 0 ? t.sprintNoTasks : t.userNoResults} />
          ) : (
            <ul className="space-y-1.5">
              {eligible.map((pb) => (
                <PbiRow key={pb.id} pb={pb} pointUnit={pointUnit} isSelected={selected.has(pb.id)} onToggle={toggle} onView={setDetailPbiId} />
              ))}
            </ul>
          )}
        </>
      ) : (
        <NewPbiFields form={newForm} onChange={setNewForm} pointUnit={pointUnit} />
      )}

      {detailPbiId && <PbiDetailModal projectId={projectId} pbiId={detailPbiId} onClose={() => setDetailPbiId(null)} />}
    </Modal>
  )
}

function TabSwitch({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useLanguage()
  const options: { value: Tab; label: string }[] = [
    { value: "existing", label: t.backlogAddPbiTabExisting },
    { value: "new", label: `+ ${t.backlogAddPbiTabNew}` },
  ]
  return (
    <div role="group" className="mb-4 inline-flex rounded-ui-md bg-surface-sunken p-0.5 text-caption font-medium">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={tab === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-8 rounded-ui-sm px-3 py-1.5",
            tab === o.value ? "bg-surface text-primary-active shadow-ui-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface RowProps {
  pb: BacklogPbi
  pointUnit: string
  isSelected: boolean
  onToggle: (id: string) => void
  onView: (id: string) => void
}

function PbiRow({ pb, pointUnit, isSelected, onToggle, onView }: RowProps) {
  const { t, language } = useLanguage()
  const title =
    pickText(pb.i18n, "initiative", pb.initiative, language).text ||
    pickText(pb.i18n, "userStory", pb.userStory, language).text ||
    "—"
  return (
    <li
      className={cn(
        "relative rounded-ui-md border",
        isSelected ? "border-primary/50 bg-primary-soft ring-1 ring-primary/40" : "border-border hover:bg-surface-muted",
      )}
    >
      <IconButton
        label={`${t.view}: #${pb.displayId}`}
        size="sm"
        icon={<EyeIcon />}
        onClick={() => onView(pb.id)}
        className="absolute right-1.5 top-1.5"
      />
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={t.backlogAddPbiSelect.replace("{id}", String(pb.displayId)) + ` ${title}`}
        onClick={() => onToggle(pb.id)}
        className="flex w-full items-start gap-3 px-3 py-2.5 pr-12 text-left"
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
            isSelected ? "border-primary bg-primary" : "border-border-strong bg-surface",
          )}
        >
          {isSelected && (
            <svg className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-caption text-fg-muted">#{pb.displayId}</span>
            <Truncate text={title} lines={2} className="min-w-0 flex-1 text-body font-semibold text-fg" />
            <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-caption text-orange-800">
              {pb.workloadScore} {pointUnit}
            </span>
          </span>
          {/* A PBI still waiting for another one is flagged before it is added to the sprint. */}
          <PbiWaitingChip item={pb} className="mt-1" />
          {pb.epic && (
            <I18nText as="span" i18n={pb.i18n} field="epic" original={pb.epic} noBadge className="mt-0.5 block truncate text-caption text-fg-muted" />
          )}
          {pb.productGoal?.title && (
            <span className="mt-0.5 block truncate text-caption text-indigo-700">
              → <I18nText i18n={pb.productGoal.i18n} field="title" original={pb.productGoal.title} noBadge />
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

function NewPbiFields({ form, onChange, pointUnit }: { form: NewPbiForm; onChange: (f: NewPbiForm) => void; pointUnit: string }) {
  const { t, pt } = useLanguage()
  const set = (key: keyof NewPbiForm) => (e: { target: { value: string } }) => onChange({ ...form, [key]: e.target.value })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={pt.backlogInitiative}>
          <Input value={form.initiative} onChange={set("initiative")} />
        </Field>
        <Field label={pt.backlogEpic}>
          <Input value={form.epic} onChange={set("epic")} />
        </Field>
      </div>
      <Field label={pt.backlogUserStory}>
        <Textarea value={form.userStory} onChange={set("userStory")} rows={4} className="resize-y" />
      </Field>
      <GlossaryHint className="-mt-2" />
      <Field label={pt.backlogAcceptanceCriteria}>
        <Textarea
          value={form.acceptanceCriteria}
          onChange={set("acceptanceCriteria")}
          rows={6}
          placeholder={t.backlogAcceptanceCriteriaPlaceholder}
          className="min-h-[160px] resize-y"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={`${pt.backlogWorkloadScore} (${pointUnit})`}>
          <Input type="number" min={0} step={1} value={form.workloadScore} onChange={set("workloadScore")} />
        </Field>
        <Field label={pt.rolePO}>
          <Input value={form.assignedPo} onChange={set("assignedPo")} />
        </Field>
      </div>
      <p className="text-caption text-fg-muted">{t.backlogAddPbiNewHint}</p>
    </div>
  )
}

interface FooterProps {
  /** null on the "new" tab (no selection count shown). */
  selectedCount: number | null
  saving: boolean
  disabled: boolean
  onSubmit: () => void
}

function Footer({ selectedCount, saving, disabled, onSubmit }: FooterProps) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <span className="mr-auto text-body text-fg-muted" aria-live="polite">
        {selectedCount !== null && t.backlogAddPbiSelectedCount.replace("{n}", String(selectedCount))}
      </span>
      <Button variant="secondary" onClick={close}>
        {t.cancel}
      </Button>
      <Button
        onClick={onSubmit}
        disabled={disabled}
        loading={saving}
        leftIcon={
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        }
      >
        {t.sprintAddPbiSubmit}
      </Button>
    </>
  )
}
