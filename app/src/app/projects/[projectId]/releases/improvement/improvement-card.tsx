"use client"

import { ArrowRight, CalendarCheck, ImageIcon, Network, TriangleAlert } from "lucide-react"
import { formatLongDate, DATE_LOCALE } from "@/lib/format-date"
import { improvementPhotoUrl } from "@/lib/improvement/constants"
import { formatMetric, formatRate } from "@/lib/improvement/labels"
import { achievementRate, isCheckDue, isWorsened, MAX_ACHIEVEMENT_RATE } from "@/lib/improvement/metrics"
import { useLanguage } from "@/lib/language-context"
import { releaseItemText } from "../release-types"
import { nextOpenCheck, type ImprovementItem } from "./improvement-types"

interface Props {
  projectId: string
  item: ImprovementItem
  onOpen: (id: string) => void
  now?: Date
}

const MAX_THUMBS = 3

/** One improvement on the board: title, Before → After (target) with the achievement bar, money, rollout, next check, photos. */
export function ImprovementCard({ projectId, item, onOpen, now = new Date() }: Props) {
  const { t, language } = useLanguage()
  const title = releaseItemText(item, language, t.sprintNotEntered)
  const next = nextOpenCheck(item)
  const overdue = next !== null && isCheckDue(next.dueDate, now)
  const done = item.rollouts.filter((r) => r.status === "done").length
  const thumbs = item.photos.slice(0, MAX_THUMBS)

  return (
    <article className="relative rounded-ui-md border border-border bg-surface p-3 shadow-ui-sm transition-shadow focus-within:shadow-ui-md hover:shadow-ui-md">
      <h3 className="text-body font-semibold leading-snug text-fg">
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          aria-label={t.kzOpenDetail.replace("{title}", title)}
          className="text-left after:absolute after:inset-0 after:rounded-ui-md after:content-['']"
        >
          {item.pbItem && <span className="mr-1.5 font-mono text-caption font-normal text-fg-muted">#{item.pbItem.displayId}</span>}
          <span className="line-clamp-2">{title}</span>
        </button>
      </h3>
      <MetricBlock item={item} />
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-fg-muted">
        {item.annualEffectYen !== null && (
          <li className="font-semibold text-fg">{t.kzYenPerYear.replace("{value}", new Intl.NumberFormat(DATE_LOCALE[language]).format(item.annualEffectYen))}</li>
        )}
        {item.rollouts.length > 0 && (
          <li className="inline-flex items-center gap-1">
            <Network aria-hidden="true" className="h-3.5 w-3.5" />
            {t.kzRolloutProgress.replace("{done}", String(done)).replace("{total}", String(item.rollouts.length))}
          </li>
        )}
        {next && (
          <li className={`inline-flex items-center gap-1 ${overdue ? "font-semibold text-danger" : ""}`}>
            {overdue ? <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" /> : <CalendarCheck aria-hidden="true" className="h-3.5 w-3.5" />}
            {(overdue ? t.kzCheckOverdueOn : t.kzNextCheck).replace("{date}", formatLongDate(next.dueDate, language, { utc: true }))}
          </li>
        )}
      </ul>
      {thumbs.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5" aria-label={t.kzPhotoCount.replace("{n}", String(item.photos.length))} role="img">
          {thumbs.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not optimisable by next/image
            <img key={p.id} src={improvementPhotoUrl(projectId, item.id, p.id)} alt="" loading="lazy" className="h-10 w-10 rounded-ui-sm border border-border object-cover" />
          ))}
          {item.photos.length > MAX_THUMBS && <span className="inline-flex items-center gap-0.5 text-caption text-fg-muted"><ImageIcon aria-hidden="true" className="h-3.5 w-3.5" />+{item.photos.length - MAX_THUMBS}</span>}
        </div>
      )}
    </article>
  )
}

/** Before → After (target) and the achievement bar; a hint when no numbers are entered yet. */
function MetricBlock({ item }: { item: ImprovementItem }) {
  const { t, language } = useLanguage()
  const locale = DATE_LOCALE[language]
  const unit = item.metricUnit ? ` ${item.metricUnit}` : ""
  if (item.baselineValue === null && item.resultValue === null) {
    return <p className="mt-2 text-caption text-fg-muted">{t.kzNoMetric}</p>
  }
  const rate = achievementRate(item)
  const worse = isWorsened(item)
  const width = rate === null ? 0 : Math.min(1, rate) * 100
  return (
    <div className="mt-2">
      {item.metricName && <p className="text-caption text-fg-muted">{item.metricName}</p>}
      <p className="flex flex-wrap items-center gap-x-1.5 text-body tabular-nums text-fg">
        <span>{formatMetric(item.baselineValue, locale) || t.kzNone}{unit}</span>
        <ArrowRight aria-label={t.kzAfter} className="h-3.5 w-3.5 text-fg-muted" />
        <span className="font-bold">{formatMetric(item.resultValue, locale) || t.kzNone}{unit}</span>
        {item.targetValue !== null && (
          <span className="text-caption text-fg-muted">({t.kzTarget} {formatMetric(item.targetValue, locale)}{unit})</span>
        )}
      </p>
      {rate !== null && (
        <div className="mt-1.5 flex items-center gap-2">
          <div
            role="meter"
            aria-label={t.kzAchievement}
            aria-valuemin={0}
            aria-valuemax={MAX_ACHIEVEMENT_RATE * 100}
            aria-valuenow={Math.round(rate * 100)}
            aria-valuetext={worse ? t.kzWorsened : formatRate(rate)}
            className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken"
          >
            <div className={`h-full rounded-full ${worse ? "bg-danger" : rate >= 1 ? "bg-success" : "bg-primary"}`} style={{ width: `${width}%` }} />
          </div>
          <span className={`text-caption font-semibold tabular-nums ${worse ? "text-danger" : "text-fg"}`}>{worse ? t.kzWorsened : formatRate(rate)}</span>
        </div>
      )}
    </div>
  )
}
