/**
 * Text built from Git activity (pure): the Daily Scrum draft and the sprint
 * release note. Plain Markdown-ish lines so they paste anywhere.
 */
export type ReportLang = "ja" | "en" | "id"

export function reportLang(raw: string | null | undefined): ReportLang {
  return raw === "en" || raw === "id" ? raw : "ja"
}

const L = {
  ja: {
    draftTitle: "【Git の動き（直近 {h} 時間）】", none: "（Git の動きはありません）", merged: "マージ", opened: "MR 作成", commits: "コミット {n} 件",
    noteTitle: "# {sprint} リリースノート", period: "期間: {from} 〜 {to}", summary: "マージした MR: {n} 件 / PBI: {p} 件", noMerged: "このスプリント期間にマージされた MR はありません。",
  },
  en: {
    draftTitle: "[Git activity (last {h} hours)]", none: "(No Git activity)", merged: "merged", opened: "MR opened", commits: "{n} commit(s)",
    noteTitle: "# {sprint} release notes", period: "Period: {from} – {to}", summary: "Merged MRs: {n} / PBIs: {p}", noMerged: "No merge request was merged in this sprint.",
  },
  id: {
    draftTitle: "[Aktivitas Git ({h} jam terakhir)]", none: "(Tidak ada aktivitas Git)", merged: "di-merge", opened: "MR dibuka", commits: "{n} commit",
    noteTitle: "# Catatan rilis {sprint}", period: "Periode: {from} – {to}", summary: "MR yang di-merge: {n} / PBI: {p}", noMerged: "Tidak ada MR yang di-merge pada sprint ini.",
  },
} as const

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""))

export interface ActivityPbi {
  displayId: number
  title: string
  merged: Array<{ ref: string; title: string; author: string | null }>
  opened: Array<{ ref: string; title: string; author: string | null }>
  commits: number
}

/** Hours back the draft looks: a Monday covers the weekend. */
export function draftWindowHours(now: Date): number {
  const jstDay = new Date(now.getTime() + 9 * 3_600_000).getUTCDay()
  return jstDay === 1 ? 72 : 24
}

const who = (a: string | null) => (a ? ` (${a})` : "")

export function formatDailyScrumDraft(pbis: readonly ActivityPbi[], hours: number, lang: ReportLang): string {
  const l = L[lang]
  const head = fill(l.draftTitle, { h: hours })
  const active = pbis.filter((p) => p.merged.length + p.opened.length + p.commits > 0)
  if (active.length === 0) return `${head}\n${l.none}`
  const lines = active.map((p) => {
    const parts = [
      ...p.merged.map((m) => `${l.merged} !${m.ref} ${m.title}${who(m.author)}`),
      ...p.opened.map((m) => `${l.opened} !${m.ref} ${m.title}${who(m.author)}`),
      ...(p.commits > 0 ? [fill(l.commits, { n: p.commits })] : []),
    ]
    return `- PBI-${p.displayId} ${p.title}: ${parts.join(" / ")}`
  })
  return [head, ...lines].join("\n")
}

export interface ReleasePbi {
  displayId: number
  title: string
  mrs: Array<{ ref: string; title: string; url: string; author: string | null }>
}

export function formatReleaseNote(sprint: { name: string; from: string; to: string }, pbis: readonly ReleasePbi[], lang: ReportLang): string {
  const l = L[lang]
  const head = [fill(l.noteTitle, { sprint: sprint.name }), fill(l.period, sprint), ""]
  const withMrs = pbis.filter((p) => p.mrs.length > 0)
  if (withMrs.length === 0) return [...head, l.noMerged].join("\n")
  const count = withMrs.reduce((n, p) => n + p.mrs.length, 0)
  const body = withMrs.flatMap((p) => [
    `## PBI-${p.displayId} ${p.title}`,
    ...p.mrs.map((m) => `- [!${m.ref}](${m.url}) ${m.title}${who(m.author)}`),
    "",
  ])
  return [...head, fill(l.summary, { n: count, p: withMrs.length }), "", ...body].join("\n").trimEnd()
}
