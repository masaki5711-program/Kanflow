"use client"

import { useState } from "react"
import { Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react"
import { Badge, Button, Field, IconButton, Input, Select, useConfirm } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { METRIC_DIRECTIONS, MS_METRIC_NAME_MAX, MS_METRIC_UNIT_MAX } from "@/lib/milestones/constants"
import { metricOnTarget } from "@/lib/milestones/summary"
import type { Announce } from "../improvement/section-frame"
import { parseYen } from "./budget-section"
import type { Metric, MilestoneBoard } from "./milestone-types"
import { TrendChart } from "./trend-chart"
import type { BoardWriter } from "./use-milestone-board"

interface Props {
  board: MilestoneBoard
  write: BoardWriter
  announce: Announce
}

type Run = (path: string, init: Parameters<BoardWriter>[1]) => Promise<boolean>

/** 推移 tab (長期品質改善): per metric the chart, the latest value vs target and the monthly entry. */
export function TrendSection({ board, write, announce }: Props) {
  const { t } = useLanguage()
  const run: Run = async (path, init) => {
    const result = await write(path, init)
    announce(result.ok ? t.msSaved : result.message, result.ok ? "success" : "error")
    return result.ok
  }
  return (
    <div className="space-y-4">
      {board.metrics.length === 0 && <p className="text-caption text-fg-muted">{t.msTrendNone}</p>}
      {board.metrics.map((m) => (
        <MetricCard key={m.id} metric={m} todayMonth={board.todayKey.slice(0, 7)} canEdit={board.permissions.canEdit} canTrack={board.permissions.canTrack} run={run} />
      ))}
      {board.permissions.canEdit && <AddMetric run={run} />}
    </div>
  )
}

interface CardProps {
  metric: Metric
  todayMonth: string
  canEdit: boolean
  canTrack: boolean
  run: Run
}

function MetricCard({ metric, todayMonth, canEdit, canTrack, run }: CardProps) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const latest = metric.points.at(-1) ?? null
  const good = latest ? metricOnTarget(metric.direction, latest.value, metric.targetValue) : null
  const unit = metric.unit ?? ""
  const Arrow = metric.direction === "increase" ? TrendingUp : TrendingDown

  async function remove() {
    if (await confirm({ message: fillTemplate(t.msDeleteConfirm, { name: metric.name }), confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) await run(`/metrics/${metric.id}`, { method: "DELETE" })
  }

  return (
    <section aria-label={metric.name} className="rounded-ui-md border border-border bg-surface p-3" data-testid="ms-metric">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-body-lg font-semibold text-fg">{metric.name}</h3>
        {unit && <span className="text-caption text-fg-muted">({unit})</span>}
        <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
          <Arrow aria-hidden="true" className="h-4 w-4" />
          {metric.direction === "increase" ? t.msMetricIncrease : t.msMetricDecrease}
        </span>
        {metric.baselineValue !== null && <span className="text-caption text-fg-muted">{t.msMetricBaseline}: {metric.baselineValue}{unit}</span>}
        {metric.targetValue !== null && <span className="text-caption text-fg-muted">{t.msMetricTarget}: {metric.targetValue}{unit}</span>}
        {good !== null && <Badge tone={good ? "success" : "warning"}>{good ? t.msOnTarget : t.msOffTarget}</Badge>}
        {canEdit && <IconButton size="sm" variant="danger" label={fillTemplate(t.msMetricDelete, { name: metric.name })} icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()} className="ml-auto" />}
      </div>
      {latest && <p className="mt-1 text-body font-semibold text-fg">{fillTemplate(t.msLatest, { month: latest.month, value: `${latest.value}${unit}` })}</p>}
      <div className="mt-2 overflow-x-auto">
        <TrendChart metric={metric} />
      </div>
      {canTrack && <PointEntry metric={metric} defaultMonth={todayMonth} run={run} />}
    </section>
  )
}

function PointEntry({ metric, defaultMonth, run }: { metric: Metric; defaultMonth: string; run: Run }) {
  const { t } = useLanguage()
  const [month, setMonth] = useState(defaultMonth)
  const [value, setValue] = useState("")
  const parsed = parseYen(value)
  const valid = /^\d{4}-\d{2}$/.test(month) && typeof parsed === "number"
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (valid && (await run(`/metrics/${metric.id}/points`, { method: "PUT", json: { month, value: parsed } }))) setValue("")
      }}
    >
      <Field label={`${t.msMonth}（${metric.name}）`} className="w-40">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Field>
      <Field label={`${t.msValue}（${metric.name}）`} className="w-32">
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" disabled={!valid}>
        {t.msValueSave}
      </Button>
    </form>
  )
}

function AddMetric({ run }: { run: Run }) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [unit, setUnit] = useState("")
  const [direction, setDirection] = useState<string>("decrease")
  const [baseline, setBaseline] = useState("")
  const [target, setTarget] = useState("")
  const num = (s: string) => {
    const v = parseYen(s)
    return typeof v === "number" ? v : null
  }
  return (
    <form
      className="grid grid-cols-2 gap-2 rounded-ui-md border border-dashed border-border-strong p-3 sm:grid-cols-[2fr_1fr_1.4fr_1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        const ok = await run("/metrics", { method: "POST", json: { name: name.trim(), unit: unit.trim() || null, direction, baselineValue: num(baseline), targetValue: num(target) } })
        if (ok) [setName, setUnit, setBaseline, setTarget].forEach((f) => f(""))
      }}
    >
      <Field label={t.msMetricName} className="col-span-2 sm:col-span-1">
        <Input value={name} maxLength={MS_METRIC_NAME_MAX} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t.msMetricUnit}>
        <Input value={unit} maxLength={MS_METRIC_UNIT_MAX} onChange={(e) => setUnit(e.target.value)} />
      </Field>
      <Field label={t.msMetricDirection}>
        <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
          {METRIC_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d === "increase" ? t.msMetricIncrease : t.msMetricDecrease}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.msMetricBaseline}>
        <Input inputMode="decimal" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
      </Field>
      <Field label={t.msMetricTarget}>
        <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} disabled={!name.trim()} className="col-span-2 sm:col-span-1">
        {t.msMetricAdd}
      </Button>
    </form>
  )
}
