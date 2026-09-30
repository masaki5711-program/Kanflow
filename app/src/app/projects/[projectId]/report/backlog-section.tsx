"use client"

import { useLanguage } from "@/lib/language-context"
import type { BacklogItem, BacklogSummary, ReportFormat } from "./types"

function BacklogTable({ items, label, color, fmt }: { items: BacklogItem[]; label: string; color: string; fmt: ReportFormat }) {
  const { t, pt } = useLanguage()
  if (items.length === 0) return null
  const totalWorkload = items.reduce((s, i) => s + (i.workloadScore ?? 0), 0)
  const showCompleted = items.some((i) => i.completedAt)
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h4 className={`text-xs font-semibold ${color}`}>{label} ({items.length}{t.reportItems})</h4>
        <span className="text-xs text-fg-muted">{t.reportTotalWorkload}: {totalWorkload} {fmt.pointUnit}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-caption border-collapse">
          <thead>
            <tr className="border-b border-gray-300 text-fg-muted">
              <th scope="col" className="text-left pb-1 pr-2 w-10">#</th>
              <th scope="col" className="text-left pb-1 pr-2">{pt.backlogInitiative}</th>
              <th scope="col" className="text-left pb-1 pr-2">{pt.backlogEpic}</th>
              <th scope="col" className="text-left pb-1 pr-2">{pt.backlogUserStory}</th>
              <th scope="col" className="text-right pb-1 pr-2">{pt.backlogWorkloadScore}</th>
              <th scope="col" className="text-left pb-1 pr-2">{t.dashboardProductGoals}</th>
              {showCompleted && <th scope="col" className="text-left pb-1">{t.backlogCompletedDate}</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const story = fmt.pick(item.i18n, "userStory", item.userStory) || "-"
              return (
                <tr key={item.displayId} className="border-b border-gray-100">
                  <td className="py-1 pr-2 font-mono text-fg-muted">{item.displayId}</td>
                  <td className="py-1 pr-2 text-gray-800">{fmt.pick(item.i18n, "initiative", item.initiative) || "-"}</td>
                  <td className="py-1 pr-2 text-gray-700">{fmt.pick(item.i18n, "epic", item.epic) || "-"}</td>
                  <td className="py-1 pr-2 text-gray-700 max-w-[200px]">
                    <span className="line-clamp-2 break-words" title={story}>{story}</span>
                  </td>
                  <td className="py-1 pr-2 text-right font-medium">{item.workloadScore}</td>
                  <td className="py-1 pr-2 text-fg-muted">{fmt.pick(item.productGoalI18n, "title", item.productGoalTitle) || "-"}</td>
                  {showCompleted && <td className="py-1 text-fg-muted">{item.completedAt ? fmt.formatDate(item.completedAt) : "-"}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, className, labelClass, valueClass }: {
  label: string; value: number; sub?: string; className: string; labelClass: string; valueClass: string
}) {
  return (
    <div className={`text-center p-3 rounded-lg ${className}`}>
      <div className={`text-xs font-medium ${labelClass}`}>{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 ${labelClass}`}>{sub}</div>}
    </div>
  )
}

/** Backlog status summary cards + per-status detail tables. */
export function BacklogSection({ items, summary, fmt }: { items: BacklogItem[]; summary: BacklogSummary; fmt: ReportFormat }) {
  const { t, pt } = useLanguage()
  return (
    <section className="report-section">
      <h3 className="report-heading">{pt.backlogTitle} - {t.sprintStatus}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryCard label={t.reportReadyItems} value={summary.ready} sub={`${summary.totalReadyWorkload} ${fmt.pointUnit}`} className="bg-blue-50" labelClass="text-blue-800" valueClass="text-blue-800" />
        <SummaryCard label={t.reportNotReadyItems} value={summary.notReady} className="bg-yellow-50" labelClass="text-yellow-800" valueClass="text-yellow-800" />
        <SummaryCard label={t.reportCompletedItems} value={summary.completed} className="bg-green-50" labelClass="text-green-800" valueClass="text-green-800" />
        <SummaryCard label={pt.backlogTitle} value={summary.ready + summary.notReady + summary.completed} className="bg-gray-50" labelClass="text-fg-muted" valueClass="text-gray-800" />
      </div>
      <BacklogTable items={items.filter((i) => i.status === "ready")} label={t.reportReadyItems} color="text-blue-800" fmt={fmt} />
      <BacklogTable items={items.filter((i) => i.status === "not_ready")} label={t.reportNotReadyItems} color="text-yellow-800" fmt={fmt} />
      <BacklogTable items={items.filter((i) => i.status === "completed")} label={t.reportCompletedItems} color="text-green-800" fmt={fmt} />
    </section>
  )
}
