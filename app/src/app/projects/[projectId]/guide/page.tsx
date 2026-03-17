"use client"

import { useState, useMemo, useCallback } from "react"
import { useLanguage } from "@/lib/language-context"
import type { ProjectType } from "@/lib/project-type-labels"
import type { ProjectTypeLabels } from "@/lib/project-type-labels"
import {
  GLOSSARY_ENTRIES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type GlossaryCategory,
} from "./glossary-data"
import {
  FAQ_ENTRIES,
  FAQ_CATEGORY_LABELS,
  FAQ_CATEGORY_COLORS,
  type FaqCategory,
} from "./faq-data"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "getting-started" | "glossary" | "help"

interface StepData {
  icon: string
  title: string
  description: string
  operation?: string
  hint?: string
  color: string
}

// ---------------------------------------------------------------------------
// Step data (per project type)
// ---------------------------------------------------------------------------

const STEP_ICONS = [
  "M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-2a4 4 0 100-8 4 4 0 000 8zm0-2a2 2 0 100-4 2 2 0 000 4z",
  "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  "M13 10V3L4 14h7v7l9-11h-7z",
  "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
] as const

const STEP_COLORS = [
  "bg-violet-500",
  "bg-yellow-500",
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-rose-500",
] as const

function getSteps(projectType: ProjectType, pt: ProjectTypeLabels): StepData[] {
  if (projectType === "process_improvement") {
    return [
      {
        icon: STEP_ICONS[0],
        title: "改善ゴール — 目指す姿を定める",
        description:
          "プロジェクト開始時に、チームが目指す改善の最終的な目標を設定します。改善ゴールは全ての活動の方向性を示す「北極星」です。改善バックログの優先順位もゴールに基づいて判断します。",
        operation: "ダッシュボード → プロダクトゴール → ゴール追加",
        hint: "ゴールは具体的で測定可能なものが理想的です。例:「不良率を50%削減」「段取替え時間を10分以内に短縮」",
        color: STEP_COLORS[0],
      },
      {
        icon: STEP_ICONS[1],
        title: "改善要望 — 現場の気づきを集める",
        description:
          "チームメンバーの誰でも改善要望や現場の気づきを投稿できます。写真や資料も添付可能です。",
        operation: `サイドバーの ${pt.navIcebox} → 要望を追加 ボタン`,
        hint: "気軽に投稿してください。この段階では精査は不要です。",
        color: STEP_COLORS[1],
      },
      {
        icon: STEP_ICONS[2],
        title: "改善オーナーレビュー — 要望を精査する",
        description:
          `${pt.rolePO}（改善オーナー）が${pt.navIcebox}の要望をレビューし、確認済み・凍結に分類します。`,
        operation: "各カードの右側のステータス変更ボタン",
        color: STEP_COLORS[2],
      },
      {
        icon: STEP_ICONS[3],
        title: "改善バックログ — 優先順位を決める",
        description:
          `確認済みの要望を${pt.navBacklog}に移し、詳細化します。${pt.rolePO}が業務負荷点数と優先順位を設定します。`,
        operation: `${pt.navBacklog} → PBI追加、ドラッグで並び替え`,
        color: STEP_COLORS[3],
      },
      {
        icon: STEP_ICONS[4],
        title: "改善サイクル計画 — 次にやることを決める",
        description:
          `1〜4週間の${pt.navSprints}を作成し、${pt.navBacklog}の上位アイテムを取り込みます。キャパシティ（チームの処理能力）を設定し、過負荷にならないよう調整します。`,
        operation: `${pt.navSprints} → 新規作成 → バックログから取り込み`,
        color: STEP_COLORS[4],
      },
      {
        icon: STEP_ICONS[5],
        title: "改善実行 — 改善施策を進める",
        description:
          "改善項目をタスクに分解し、担当者をアサイン。ステータスをクリックで Todo → 進行中 → 完了 と更新します。",
        operation: "各タスクのステータスアイコンをクリック",
        color: STEP_COLORS[5],
      },
      {
        icon: STEP_ICONS[6],
        title: "効果検証＆振り返り — 改善効果を確認する",
        description:
          "改善サイクル終了時に効果検証と振り返りメモ（KPT）を記録。改善前後の数値を比較し、次のサイクルに活かします。",
        color: STEP_COLORS[6],
      },
      {
        icon: STEP_ICONS[7],
        title: "標準化・展開 — 成果を展開する",
        description:
          "効果が確認された改善施策を標準作業手順書（SOP）に落とし込み、他のラインや工程にも水平展開します。",
        operation: `サイドバー → ${pt.navReleases} → 作成`,
        color: STEP_COLORS[7],
      },
    ]
  }

  if (projectType === "general") {
    return [
      {
        icon: STEP_ICONS[0],
        title: "プロジェクトゴール — 目指す姿を定める",
        description:
          "プロジェクト開始時に、チームが目指す最終的な目標を設定します。プロジェクトゴールは全ての活動の方向性を示す「北極星」です。バックログの優先順位もゴールに基づいて判断します。",
        operation: "ダッシュボード → プロダクトゴール → ゴール追加",
        hint: "ゴールは具体的で測定可能なものが理想的です。例:「イベント参加者を200名達成」「業務効率を30%改善」",
        color: STEP_COLORS[0],
      },
      {
        icon: STEP_ICONS[1],
        title: "アイデアBox — アイデアを集める",
        description:
          "チームメンバーの誰でもアイデアや提案を投稿できます。写真や資料も添付可能です。",
        operation: `サイドバーの ${pt.navIcebox} → 要望を追加 ボタン`,
        hint: "気軽に投稿してください。この段階では精査は不要です。",
        color: STEP_COLORS[1],
      },
      {
        icon: STEP_ICONS[2],
        title: "オーナーレビュー — アイデアを精査する",
        description:
          `${pt.rolePO}（オーナー）が${pt.navIcebox}の提案をレビューし、確認済み・凍結に分類します。`,
        operation: "各カードの右側のステータス変更ボタン",
        color: STEP_COLORS[2],
      },
      {
        icon: STEP_ICONS[3],
        title: "プロジェクトバックログ — 優先順位を決める",
        description:
          `確認済みの提案を${pt.navBacklog}に移し、詳細化します。${pt.rolePO}が業務負荷点数と優先順位を設定します。`,
        operation: `${pt.navBacklog} → PBI追加、ドラッグで並び替え`,
        color: STEP_COLORS[3],
      },
      {
        icon: STEP_ICONS[4],
        title: "スプリント計画 — 次にやることを決める",
        description:
          `1〜4週間の${pt.navSprints}を作成し、${pt.navBacklog}の上位アイテムを取り込みます。キャパシティ（チームの処理能力）を設定し、過負荷にならないよう調整します。`,
        operation: `${pt.navSprints} → 新規作成 → バックログから取り込み`,
        color: STEP_COLORS[4],
      },
      {
        icon: STEP_ICONS[5],
        title: "タスク実行 — タスクを進める",
        description:
          "バックログ項目をタスクに分解し、担当者をアサイン。ステータスをクリックで Todo → 進行中 → 完了 と更新します。",
        operation: "各タスクのステータスアイコンをクリック",
        color: STEP_COLORS[5],
      },
      {
        icon: STEP_ICONS[6],
        title: "レビュー＆振り返り — 改善する",
        description:
          "スプリント終了時にレビューコメントと振り返りメモ（KPT）を記録。次のスプリントに活かします。",
        color: STEP_COLORS[6],
      },
      {
        icon: STEP_ICONS[7],
        title: "成果物・マイルストーン — 成果を届ける",
        description:
          "完了した項目をまとめ、マイルストーンとして管理・共有します。",
        operation: `サイドバー → ${pt.navReleases} → 作成`,
        color: STEP_COLORS[7],
      },
    ]
  }

  // software (default)
  return [
    {
      icon: STEP_ICONS[0],
      title: "プロダクトゴール — 目指す姿を定める",
      description:
        "プロジェクト開始時に、チームが目指すプロダクトの最終的な目標を設定します。プロダクトゴールは全ての活動の方向性を示す「北極星」です。バックログの優先順位もゴールに基づいて判断します。",
      operation: "ダッシュボード → プロダクトゴール → ゴール追加",
      hint: "ゴールは具体的で測定可能なものが理想的です。例:「顧客満足度を20%向上」「月間アクティブユーザー1000人達成」",
      color: STEP_COLORS[0],
    },
    {
      icon: STEP_ICONS[1],
      title: "IceBox — アイデアを集める",
      description:
        "チームメンバーの誰でも改善要望やアイデアを投稿できます。写真や資料も添付可能です。",
      operation: "サイドバーの IceBox → 要望を追加 ボタン",
      hint: "気軽に投稿してください。この段階では精査は不要です。",
      color: STEP_COLORS[1],
    },
    {
      icon: STEP_ICONS[2],
      title: "POレビュー — アイデアを精査する",
      description:
        "PO（プロダクトオーナー）がIceBoxの要望をレビューし、確認済み・凍結に分類します。",
      operation: "各カードの右側のステータス変更ボタン",
      color: STEP_COLORS[2],
    },
    {
      icon: STEP_ICONS[3],
      title: "バックログ — 優先順位を決める",
      description:
        "確認済みの要望をプロダクトバックログに移し、ユーザーストーリー形式で詳細化。POが業務負荷点数と優先順位を設定します。",
      operation: "バックログ → PBI追加、ドラッグで並び替え",
      hint: "ユーザーストーリーの書き方：「＜誰が＞として、＜何を＞したい。それは＜なぜ＞だからだ。」",
      color: STEP_COLORS[3],
    },
    {
      icon: STEP_ICONS[4],
      title: "スプリント計画 — 次にやることを決める",
      description:
        "1〜4週間のスプリントを作成し、バックログの上位アイテムを取り込みます。キャパシティ（チームの処理能力）を設定し、過負荷にならないよう調整します。",
      operation: "スプリント → 新規スプリント → PBから取り込み",
      color: STEP_COLORS[4],
    },
    {
      icon: STEP_ICONS[5],
      title: "スプリント実行 — タスクを進める",
      description:
        "PBIをタスクに分解し、担当者をアサイン。ステータスをクリックで Todo → 進行中 → 完了 と更新します。",
      operation: "各タスクのステータスアイコンをクリック",
      color: STEP_COLORS[5],
    },
    {
      icon: STEP_ICONS[6],
      title: "レビュー＆振り返り — 改善する",
      description:
        "スプリント終了時にレビューコメントと振り返りメモ（KPT）を記録。次のスプリントに活かします。",
      color: STEP_COLORS[6],
    },
    {
      icon: STEP_ICONS[7],
      title: "リリース — 成果を届ける",
      description:
        "完了したPBIをリリースバックログに取り込み、バージョン管理してリリースします。",
      operation: "サイドバー → リリース → リリース作成",
      color: STEP_COLORS[7],
    },
  ]
}

// ---------------------------------------------------------------------------
// Tab labels
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string }[] = [
  { key: "getting-started", label: "はじめに" },
  { key: "glossary", label: "用語集" },
  { key: "help", label: "ヘルプ" },
]

// ---------------------------------------------------------------------------
// SVG icon helper
// ---------------------------------------------------------------------------

function SvgIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className ?? "w-5 h-5"}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={`w-5 h-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Step accordion item
// ---------------------------------------------------------------------------

function StepItem({
  step,
  index,
  isOpen,
  isLast,
  onToggle,
}: {
  step: StepData
  index: number
  isOpen: boolean
  isLast: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex gap-4">
      {/* Left column: number badge + vertical line */}
      <div className="flex flex-col items-center">
        <button
          onClick={onToggle}
          className={`w-10 h-10 rounded-full ${step.color} text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-md hover:scale-110 transition-transform`}
        >
          {index + 1}
        </button>
        {!isLast && (
          <div className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-700 my-1" />
        )}
      </div>

      {/* Right column: content */}
      <div className="flex-1 pb-6">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 w-full text-left group"
        >
          <div className={`w-8 h-8 rounded-lg ${step.color}/10 flex items-center justify-center`}>
            <SvgIcon d={step.icon} className={`w-5 h-5 ${step.color.replace("bg-", "text-")}`} />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-1">
            {step.title}
          </h3>
          <ChevronIcon open={isOpen} />
        </button>

        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isOpen ? "max-h-96 opacity-100 mt-3" : "max-h-0 opacity-0"
          }`}
        >
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {step.description}
          </p>

          {step.operation && (
            <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                Kanflowでの操作
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                {step.operation}
              </p>
            </div>
          )}

          {step.hint && (
            <div className="mt-2 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <SvgIcon
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                className="w-4 h-4 shrink-0 mt-0.5"
              />
              <span>{step.hint}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Getting Started tab
// ---------------------------------------------------------------------------

const INTRO_TEXT: Record<ProjectType, string> = {
  software:
    "Kanflowを使ったスクラム開発の流れを、8つのステップで説明します。各ステップをクリックして詳細を確認してください。",
  process_improvement:
    "Kanflowを使った工程改善の流れを、8つのステップで説明します。各ステップをクリックして詳細を確認してください。",
  general:
    "Kanflowを使ったプロジェクト運営の流れを、8つのステップで説明します。各ステップをクリックして詳細を確認してください。",
}

function GettingStartedTab() {
  const { projectType, pt } = useLanguage()
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({ 0: true })

  const steps = useMemo(() => getSteps(projectType, pt), [projectType, pt])

  const toggle = useCallback((idx: number) => {
    setOpenSteps((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }, [])

  return (
    <div className="space-y-0">
      <div className="mb-6">
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {INTRO_TEXT[projectType]}
        </p>
      </div>
      {steps.map((step, i) => (
        <StepItem
          key={i}
          step={step}
          index={i}
          isOpen={!!openSteps[i]}
          isLast={i === steps.length - 1}
          onToggle={() => toggle(i)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Glossary tab
// ---------------------------------------------------------------------------

function GlossaryTab() {
  const { projectType } = useLanguage()
  const [search, setSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState<GlossaryCategory | "all">("all")

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return GLOSSARY_ENTRIES.filter((entry) => {
      const matchesType = !entry.projectTypes || entry.projectTypes.includes(projectType)
      const matchesSearch =
        !q ||
        entry.term.toLowerCase().includes(q) ||
        entry.english.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q)
      const matchesCategory = filterCategory === "all" || entry.category === filterCategory
      return matchesType && matchesSearch && matchesCategory
    })
  }, [search, filterCategory, projectType])

  return (
    <div>
      {/* Search & filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <SvgIcon
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="用語を検索..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterCategory("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === "all"
                ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-800"
                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}
          >
            すべて
          </button>
          {(Object.keys(CATEGORY_LABELS) as GlossaryCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterCategory === cat
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-800"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
        {filtered.length} 件の用語
      </p>

      {/* Cards grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((entry) => (
          <div
            key={entry.term}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {entry.term}
                </h4>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {entry.english}
                </p>
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${CATEGORY_COLORS[entry.category]}`}
              >
                {CATEGORY_LABELS[entry.category]}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {entry.description}
            </p>
            {entry.kanflow && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-600 dark:text-blue-400">
                <SvgIcon
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  className="w-3 h-3"
                />
                <span>{entry.kanflow}</span>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-sm text-slate-400">
            検索結果が見つかりませんでした
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Help / FAQ tab
// ---------------------------------------------------------------------------

function HelpTab() {
  const { projectType } = useLanguage()
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({})
  const [filterCategory, setFilterCategory] = useState<FaqCategory | "all">("all")

  const filtered = useMemo(() => {
    return FAQ_ENTRIES.filter((item) => {
      const matchesType = !item.projectTypes || item.projectTypes.includes(projectType)
      const matchesCategory = filterCategory === "all" || item.category === filterCategory
      return matchesType && matchesCategory
    })
  }, [filterCategory, projectType])

  const toggle = (idx: number) => {
    setOpenItems((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  return (
    <div>
      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap mb-6">
        <button
          onClick={() => setFilterCategory("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filterCategory === "all"
              ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-800"
              : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
          }`}
        >
          すべて
        </button>
        {(Object.keys(FAQ_CATEGORY_LABELS) as FaqCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === cat
                ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-800"
                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}
          >
            {FAQ_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* FAQ list */}
      <div className="space-y-2">
        {filtered.map((item, i) => {
          const globalIndex = FAQ_ENTRIES.indexOf(item)
          const isOpen = !!openItems[globalIndex]
          return (
            <div
              key={globalIndex}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 overflow-hidden"
            >
              <button
                onClick={() => toggle(globalIndex)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-gray-750 transition-colors"
              >
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${FAQ_CATEGORY_COLORS[item.category]}`}
                >
                  {FAQ_CATEGORY_LABELS[item.category]}
                </span>
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                  {item.question}
                </span>
                <ChevronIcon open={isOpen} />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  isOpen ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="px-4 pb-4 pt-0 ml-[72px]">
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GuidePage() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<Tab>("getting-started")

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-gray-900">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <SvgIcon
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
              className="w-5 h-5 text-blue-600 dark:text-blue-400"
            />
          </div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {t.guideTitle}
          </h1>
        </div>

        {/* Tab bar — segment control */}
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden text-xs font-medium">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 transition-colors ${
                activeTab === tab.key
                  ? "bg-blue-500 text-white"
                  : "bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {activeTab === "getting-started" && <GettingStartedTab />}
          {activeTab === "glossary" && <GlossaryTab />}
          {activeTab === "help" && <HelpTab />}
        </div>
      </div>
    </div>
  )
}
