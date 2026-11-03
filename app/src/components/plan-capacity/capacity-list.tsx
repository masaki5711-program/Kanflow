"use client"

import { useId, useState } from "react"
import { Button, Field, Input, Select, useToast } from "@/components/ui"
import { useFocusAfterReload } from "@/components/plan-lesson-rules/use-focus-after-reload"
import { apiFetch } from "@/hooks"
import { isApiError, localizeApiError } from "@/hooks/api-client"
import { fillTemplate } from "@/lib/fill-template"
import { formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"

export interface CapacityRowView {
  id: string
  userId: string
  from: string
  to: string | null
  fte: number
  version: number
}

interface Props {
  rows: CapacityRowView[]
  /** Where rows are created ({ from, to, fte } + userId when `members` is given) and edited (`${url}/${id}`). */
  url: string
  /** Allocation lists pick a member; the own-FTE list has none. */
  members?: { userId: string; name: string }[]
  canEdit: boolean
  emptyText: string
  /** Element id focused when the last row is removed (the section heading). */
  headingId: string
  onChanged: () => void
}

type FieldKey = "member" | "from" | "to" | "fte"
type Errors = Partial<Record<FieldKey, string>>

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** A list of capacity periods with add / remove. Percentages (whole numbers) are shown and entered; the API stores 0..1. */
export function CapacityList({ rows, url, members, canEdit, emptyText, headingId, onChanged }: Props) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const base = useId()
  const ids: Record<FieldKey, string> = { member: `${base}-member`, from: `${base}-from`, to: `${base}-to`, fte: `${base}-fte` }
  const removeId = (rowId: string) => `${base}-rm-${rowId}`
  const focusAfterReload = useFocusAfterReload(rows, false, removeId)
  const [userId, setUserId] = useState(members?.[0]?.userId ?? "")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [pct, setPct] = useState("100")
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const nameOf = (u: string) => members?.find((m) => m.userId === u)?.name ?? ""
  const long = (k: string) => formatLongDate(k, language, { utc: true })
  const period = (r: CapacityRowView) => (r.to ? fillTemplate(t.pcpPeriod, { from: long(r.from), to: long(r.to) }) : fillTemplate(t.pcpPeriodOpen, { from: long(r.from) }))
  const pctOf = (fte: number) => fillTemplate(t.pcpPercent, { n: Math.round(fte * 100) })
  const removeLabel = (r: CapacityRowView) => {
    const label = r.to
      ? fillTemplate(t.pcpRemoveLabel, { period: period(r), fte: pctOf(r.fte) })
      : fillTemplate(t.pcpRemoveLabelOpen, { from: long(r.from), fte: pctOf(r.fte) })
    return members ? fillTemplate(t.pcpRemoveFor, { name: nameOf(r.userId), label }) : label
  }

  /** Clears a field's error as soon as it is edited. */
  const edited = (key: FieldKey) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))

  function validate(): Errors {
    const e: Errors = {}
    if (members && !userId) e.member = t.pcpErrMember
    if (!YMD.test(from)) e.from = t.pcpErrFrom
    if (to && (!YMD.test(to) || (YMD.test(from) && to < from))) e.to = t.pcpErrTo
    const n = Number(pct)
    if (!/^\d{1,3}$/.test(pct.trim()) || n > 100) e.fte = t.pcpErrFte
    return e
  }

  async function add() {
    if (busy) return
    const e = validate()
    setErrors(e)
    const first = (["member", "from", "to", "fte"] as const).find((k) => e[k])
    if (first) {
      document.getElementById(ids[first])?.focus()
      return
    }
    setBusy(true)
    try {
      await apiFetch(url, { method: "POST", json: { ...(members ? { userId } : {}), from, to: to || null, fte: Number(pct) / 100 } })
      toast.success(t.pcpSaved)
      setFrom("")
      setTo("")
      onChanged()
    } catch (err) {
      toast.error(localizeApiError(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function remove(r: CapacityRowView, index: number) {
    if (busy) return
    setBusy(true)
    try {
      await apiFetch(`${url}/${r.id}`, { method: "DELETE", json: { version: r.version } })
      toast.success(t.pcpRemoved)
      // The button unmounts: focus the next row's button, else the previous one, else the section heading.
      const neighbour = rows[index + 1] ?? rows[index - 1]
      focusAfterReload(neighbour?.id ?? null, headingId)
      onChanged()
    } catch (err) {
      toast.error(localizeApiError(err, t))
      // Someone else changed the row: reload so the next try uses the current version.
      if (isApiError(err) && err.code === "CAPACITY_CHANGED") onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-body text-fg-muted">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border rounded-ui-lg border border-border">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-body tabular-nums">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {members && <span className="mr-2 font-medium text-fg">{nameOf(r.userId)}</span>}
                <span className="text-fg-muted">{period(r)}</span>
                <span className="ml-2 font-semibold text-fg">{pctOf(r.fte)}</span>
              </span>
              {canEdit && (
                <Button id={removeId(r.id)} size="sm" variant="ghost" aria-disabled={busy || undefined} aria-label={removeLabel(r)} onClick={() => void remove(r, i)}>
                  {t.pcpRemove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] sm:items-start"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          {members && (
            <Field id={ids.member} label={t.pcpFieldMember} error={errors.member} required>
              <Select
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value)
                  edited("member")
                }}
              >
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field id={ids.from} label={t.pcpFieldFrom} error={errors.from} required>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                edited("from")
              }}
            />
          </Field>
          <Field id={ids.to} label={t.pcpFieldTo} error={errors.to}>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                edited("to")
              }}
            />
          </Field>
          <Field id={ids.fte} label={t.pcpFieldFte} hint={t.pcpFieldFteHint} error={errors.fte} required>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={pct}
              onChange={(e) => {
                setPct(e.target.value)
                edited("fte")
              }}
            />
          </Field>
          <div className="sm:pt-7">
            <Button type="submit" variant="secondary" aria-disabled={busy || undefined}>
              {t.pcpAdd}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
