"use client"

import { useLanguage } from "@/lib/language-context"
import type { Language } from "@/lib/i18n"

// Local multilingual dictionary for diagram labels only.
// Keeping it co-located so the diagram stays self-contained.
const L: Record<string, Record<Language, string>> = {
  title: {
    ja: "スクラム全体の流れ",
    en: "Scrum Overview",
    id: "Ikhtisar Scrum",
  },
  legendRoles: {
    ja: "スクラムチーム（3つのロール）",
    en: "Scrum Team (3 roles)",
    id: "Scrum Team (3 peran)",
  },
  po: { ja: "プロダクトオーナー (PO)", en: "Product Owner (PO)", id: "Product Owner (PO)" },
  sm: { ja: "スクラムマスター (SM)", en: "Scrum Master (SM)", id: "Scrum Master (SM)" },
  dev: { ja: "開発者", en: "Developers", id: "Developer" },
  poDesc: {
    ja: "価値の最大化とバックログの優先順位付け",
    en: "Maximizes value; orders the backlog",
    id: "Memaksimalkan nilai; menata prioritas backlog",
  },
  smDesc: {
    ja: "スクラムの推進と障害除去",
    en: "Facilitates Scrum; removes impediments",
    id: "Memfasilitasi Scrum; menghilangkan hambatan",
  },
  devDesc: {
    ja: "増分を作る実行者",
    en: "Build the increment",
    id: "Membangun increment",
  },
  productGoal: { ja: "プロダクトゴール", en: "Product Goal", id: "Product Goal" },
  productBacklog: { ja: "プロダクトバックログ", en: "Product Backlog", id: "Product Backlog" },
  productBacklogOwner: { ja: "PO が管理", en: "Managed by PO", id: "Dikelola PO" },
  sprintPlanning: { ja: "スプリントプランニング", en: "Sprint Planning", id: "Sprint Planning" },
  sprintPlanningAttendees: {
    ja: "参加: PO・SM・開発者",
    en: "Attendees: PO, SM, Developers",
    id: "Peserta: PO, SM, Developer",
  },
  sprintPlanningTimebox: {
    ja: "タイムボックス: 最大2h (1週) 〜 8h (4週)",
    en: "Timebox: up to 2h (1wk) – 8h (4wk)",
    id: "Timebox: hingga 2j (1mg) – 8j (4mg)",
  },
  sprintBacklog: { ja: "スプリントバックログ", en: "Sprint Backlog", id: "Sprint Backlog" },
  sprintBacklogDesc: {
    ja: "このスプリントで取り組むPBIとタスク",
    en: "PBIs + tasks for this Sprint",
    id: "PBI + tugas untuk Sprint ini",
  },
  sprintContainer: {
    ja: "スプリント (1〜4週間の固定タイムボックス)",
    en: "Sprint (1-4 week fixed timebox)",
    id: "Sprint (timebox tetap 1-4 minggu)",
  },
  dailyScrum: { ja: "デイリースクラム", en: "Daily Scrum", id: "Daily Scrum" },
  dailyScrumAttendees: {
    ja: "参加: 開発者 (15分)",
    en: "Attendees: Developers (15 min)",
    id: "Peserta: Developer (15 menit)",
  },
  dailyScrumNote: {
    ja: "毎日同じ時刻に開催",
    en: "Held every day at the same time",
    id: "Diadakan tiap hari pada waktu sama",
  },
  development: { ja: "開発・検証", en: "Develop & verify", id: "Kembangkan & verifikasi" },
  increment: { ja: "インクリメント (Done)", en: "Increment (Done)", id: "Increment (Selesai)" },
  sprintReview: { ja: "スプリントレビュー", en: "Sprint Review", id: "Sprint Review" },
  sprintReviewAttendees: {
    ja: "参加: チーム全体 + ステークホルダー",
    en: "Attendees: Team + Stakeholders",
    id: "Peserta: Tim + Pemangku Kepentingan",
  },
  sprintReviewTimebox: {
    ja: "タイムボックス: 最大1h (1週) 〜 4h (4週)",
    en: "Timebox: up to 1h (1wk) – 4h (4wk)",
    id: "Timebox: hingga 1j (1mg) – 4j (4mg)",
  },
  sprintRetro: { ja: "スプリントレトロスペクティブ", en: "Sprint Retrospective", id: "Sprint Retrospective" },
  sprintRetroAttendees: {
    ja: "参加: スクラムチームのみ",
    en: "Attendees: Scrum Team only",
    id: "Peserta: hanya Scrum Team",
  },
  sprintRetroTimebox: {
    ja: "タイムボックス: 最大45分 (1週) 〜 3h (4週)",
    en: "Timebox: up to 45min (1wk) – 3h (4wk)",
    id: "Timebox: hingga 45m (1mg) – 3j (4mg)",
  },
  nextSprint: {
    ja: "次のスプリントへ",
    en: "Back to next Sprint",
    id: "Kembali ke Sprint berikutnya",
  },
  legendArtifact: { ja: "アーティファクト", en: "Artifact", id: "Artefak" },
  legendEvent: { ja: "イベント", en: "Event", id: "Acara" },
}

function T(key: keyof typeof L, lang: Language): string {
  return L[key][lang]
}

export default function ScrumOverviewDiagram() {
  const { language } = useLanguage()

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 md:p-6 mb-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-blue-600" aria-hidden="true" viewBox="0 0 20 20" fill="currentColor">
          <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v2H4V4zm0 4h12v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/>
        </svg>
        <h3 className="text-base font-bold text-slate-800">
          {T("title", language)}
        </h3>
      </div>

      {/* Legend: roles */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          {T("legendRoles", language)}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <RoleCard color="amber" title={T("po", language)} desc={T("poDesc", language)} />
          <RoleCard color="emerald" title={T("sm", language)} desc={T("smDesc", language)} />
          <RoleCard color="sky" title={T("dev", language)} desc={T("devDesc", language)} />
        </div>
      </div>

      {/* Flow diagram */}
      <div className="space-y-2">
        {/* Product Goal */}
        <DiagramBox variant="artifact" color="indigo" label={T("productGoal", language)} narrow />
        <Arrow />

        {/* Product Backlog */}
        <DiagramBox
          variant="artifact"
          color="indigo"
          label={T("productBacklog", language)}
          sub={T("productBacklogOwner", language)}
        />
        <Arrow />

        {/* Sprint Planning */}
        <DiagramBox
          variant="event"
          color="blue"
          label={T("sprintPlanning", language)}
          sub={T("sprintPlanningAttendees", language)}
          hint={T("sprintPlanningTimebox", language)}
        />
        <Arrow />

        {/* Sprint Backlog */}
        <DiagramBox
          variant="artifact"
          color="violet"
          label={T("sprintBacklog", language)}
          sub={T("sprintBacklogDesc", language)}
        />
        <Arrow />

        {/* Sprint container */}
        <div className="relative rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/40 px-4 py-4">
          <div className="absolute -top-3 left-4 bg-white px-2 text-xs font-bold text-blue-700 rounded">
            {T("sprintContainer", language)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            {/* Daily scrum (loops) */}
            <div className="bg-white rounded-xl border border-teal-300 p-3 relative">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-500 text-white text-caption font-bold">
                  ↻
                </span>
                <span className="text-sm font-bold text-teal-800">
                  {T("dailyScrum", language)}
                </span>
              </div>
              <p className="text-xs text-teal-700">{T("dailyScrumAttendees", language)}</p>
              <p className="text-caption text-slate-500 italic mt-0.5">
                {T("dailyScrumNote", language)}
              </p>
            </div>

            {/* Development → Increment */}
            <div className="bg-white rounded-xl border border-sky-300 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-sky-800">
                  {T("development", language)}
                </span>
                <span className="text-fg-subtle" aria-hidden="true">→</span>
                <span className="text-sm font-bold text-emerald-700">
                  {T("increment", language)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Arrow />

        {/* Sprint Review */}
        <DiagramBox
          variant="event"
          color="violet"
          label={T("sprintReview", language)}
          sub={T("sprintReviewAttendees", language)}
          hint={T("sprintReviewTimebox", language)}
        />
        <Arrow />

        {/* Sprint Retro */}
        <DiagramBox
          variant="event"
          color="rose"
          label={T("sprintRetro", language)}
          sub={T("sprintRetroAttendees", language)}
          hint={T("sprintRetroTimebox", language)}
        />
        <Arrow loop label={T("nextSprint", language)} />
      </div>

      {/* Legend (color coding) */}
      <div className="mt-5 flex flex-wrap gap-3 text-caption text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-indigo-400" />
          {T("legendArtifact", language)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
          {T("legendEvent", language)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-teal-500" />
          Daily Scrum
        </span>
      </div>
    </div>
  )
}

// ----------------- building blocks -----------------

const roleColors: Record<string, { bg: string; border: string; title: string; text: string }> = {
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    title: "text-amber-800",
    text: "text-amber-700",
  },
  emerald: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    title: "text-emerald-800",
    text: "text-emerald-700",
  },
  sky: {
    bg: "bg-sky-50",
    border: "border-sky-300",
    title: "text-sky-800",
    text: "text-sky-700",
  },
}

function RoleCard({
  color,
  title,
  desc,
}: {
  color: keyof typeof roleColors
  title: string
  desc: string
}) {
  const c = roleColors[color]
  return (
    <div className={`${c.bg} ${c.border} border rounded-lg p-2.5`}>
      <p className={`${c.title} text-xs font-bold`}>{title}</p>
      <p className={`${c.text} text-caption mt-0.5`}>{desc}</p>
    </div>
  )
}

const boxColors: Record<
  string,
  { border: string; bg: string; label: string; sub: string }
> = {
  indigo: {
    border: "border-indigo-300",
    bg: "bg-indigo-50",
    label: "text-indigo-800",
    sub: "text-indigo-600",
  },
  blue: {
    border: "border-blue-300",
    bg: "bg-blue-50",
    label: "text-blue-800",
    sub: "text-blue-600",
  },
  violet: {
    border: "border-violet-300",
    bg: "bg-violet-50",
    label: "text-violet-800",
    sub: "text-violet-600",
  },
  rose: {
    border: "border-rose-300",
    bg: "bg-rose-50",
    label: "text-rose-800",
    sub: "text-rose-600",
  },
}

function DiagramBox({
  variant,
  color,
  label,
  sub,
  hint,
  narrow,
}: {
  variant: "artifact" | "event"
  color: keyof typeof boxColors
  label: string
  sub?: string
  hint?: string
  narrow?: boolean
}) {
  const { language } = useLanguage()
  const c = boxColors[color]
  // Localized badge (A3-20): the same words as the legend, not English capitals.
  const tag =
    variant === "artifact"
      ? { txt: T("legendArtifact", language), cls: "bg-indigo-500/80" }
      : { txt: T("legendEvent", language), cls: "bg-blue-500/80" }
  return (
    <div
      className={`${c.bg} ${c.border} border-2 rounded-xl px-4 py-3 ${narrow ? "max-w-sm mx-auto" : ""}`}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`${tag.cls} text-white text-caption font-bold px-1.5 py-0.5 rounded`}>
          {tag.txt}
        </span>
        <span className={`${c.label} text-sm font-bold`}>{label}</span>
      </div>
      {sub && <p className={`${c.sub} text-xs`}>{sub}</p>}
      {hint && (
        <p className="text-caption text-slate-500 italic mt-0.5">{hint}</p>
      )}
    </div>
  )
}

function Arrow({ loop, label }: { loop?: boolean; label?: string } = {}) {
  return (
    <div className="flex justify-center items-center my-0">
      <div className="flex flex-col items-center">
        <svg className="w-5 h-5 text-fg-subtle" aria-hidden="true" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v9.586l3.293-3.293a1 1 0 111.414 1.414l-5 5a1 1 0 01-1.414 0l-5-5a1 1 0 111.414-1.414L9 13.586V4a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
        {loop && label && (
          <span className="text-xs text-slate-500 italic mt-1">↻ {label}</span>
        )}
      </div>
    </div>
  )
}
