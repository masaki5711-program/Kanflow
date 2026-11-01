/**
 * Prevention-PBI proposal text of the recurrence step (W11; pure). Built as an AI-chat `create_pbi`
 * proposal (lib/chat-proposals) so the PO's approval card creates the PBI under the PO's own rights.
 */
import { createPbiProposalSchema, type ChatProposal } from "@/lib/chat-proposals"

export type ProposalLang = "ja" | "en" | "id"

export interface RecurrenceFacts {
  signature: string
  /** Redacted first lines of the failure. */
  signatureText: string
  tool: string
  errorCode: string | null
  /** Failures with this signature in the window. */
  count: number
  windowDays: number
  /** A confirmed / systemized lesson exists and the failure came back after it. */
  lessonRecurred: boolean
  projectName: string
  fix: string | null
  systemizedRef: string | null
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
export const proposalId = (signature: string) => `fbk-${signature.slice(0, 24)}`
/** Marker at the end of the thread title: finds the thread of a signature without a text search. */
export const threadMarker = (signature: string) => `[fb:${signature.slice(0, 12)}]`

const TEXT = {
  ja: {
    titlePrefix: "再発防止",
    story: (what: string) => `開発チームとして、「${what}」の失敗が繰り返されないよう、仕組み（ゲート・テストなど）で防ぎたい`,
    why: (f: RecurrenceFacts) =>
      f.lessonRecurred
        ? `確認済みの教訓がある失敗が、教訓の確認後も再発しました（直近 ${f.windowDays} 日で ${f.count} 回）。`
        : `同じ失敗が直近 ${f.windowDays} 日で ${f.count} 回起きました。`,
    ac: (f: RecurrenceFacts) =>
      [
        `署名: ${f.signature.slice(0, 12)}（${f.tool}${f.errorCode ? ` / ${f.errorCode}` : ""}）`,
        `回数: 直近 ${f.windowDays} 日で ${f.count} 回 / プロジェクト: ${f.projectName}`,
        f.fix ? `教訓の直し方: ${short(f.fix, 400)}` : "教訓の直し方: まだありません（教訓の画面で確認してください）",
        f.systemizedRef ? `これまでの仕組み化: ${f.systemizedRef}` : "",
        "対策の種類（ゲート / テスト / eval / 規則 / エラーの目録 のどれにするか）: ________",
        `対策を入れたあと、同じ署名の失敗が ${f.windowDays} 日間出ないこと`,
      ]
        .filter(Boolean)
        .join("\n"),
    message: "同じ失敗が繰り返されています。再発防止の PBI を提案します。内容を確認し、よければ承認してください。",
  },
  en: {
    titlePrefix: "Prevent recurrence",
    story: (what: string) => `As the development team, we want a mechanism (a gate, a test, …) that stops "${what}" from happening again`,
    why: (f: RecurrenceFacts) =>
      f.lessonRecurred
        ? `A failure that has a confirmed lesson came back after the lesson was confirmed (${f.count} times in the last ${f.windowDays} days).`
        : `The same failure happened ${f.count} times in the last ${f.windowDays} days.`,
    ac: (f: RecurrenceFacts) =>
      [
        `Signature: ${f.signature.slice(0, 12)} (${f.tool}${f.errorCode ? ` / ${f.errorCode}` : ""})`,
        `Count: ${f.count} in the last ${f.windowDays} days / Project: ${f.projectName}`,
        f.fix ? `Lesson fix: ${short(f.fix, 400)}` : "Lesson fix: none yet (review the lesson on the Lessons screen)",
        f.systemizedRef ? `Already systemized as: ${f.systemizedRef}` : "",
        "Kind of measure (gate / test / eval / rule / error catalog): ________",
        `After the measure is in, no failure with this signature for ${f.windowDays} days`,
      ]
        .filter(Boolean)
        .join("\n"),
    message: "The same failure keeps happening. I propose a prevention PBI. Please review it and approve it if it looks right.",
  },
  id: {
    titlePrefix: "Cegah terulang",
    story: (what: string) => `Sebagai tim pengembang, kami ingin mekanisme (gate, tes, dll.) yang mencegah "${what}" terulang`,
    why: (f: RecurrenceFacts) =>
      f.lessonRecurred
        ? `Kegagalan yang sudah punya pelajaran terkonfirmasi muncul lagi setelah dikonfirmasi (${f.count} kali dalam ${f.windowDays} hari terakhir).`
        : `Kegagalan yang sama terjadi ${f.count} kali dalam ${f.windowDays} hari terakhir.`,
    ac: (f: RecurrenceFacts) =>
      [
        `Tanda tangan: ${f.signature.slice(0, 12)} (${f.tool}${f.errorCode ? ` / ${f.errorCode}` : ""})`,
        `Jumlah: ${f.count} dalam ${f.windowDays} hari terakhir / Proyek: ${f.projectName}`,
        f.fix ? `Perbaikan pada pelajaran: ${short(f.fix, 400)}` : "Perbaikan pada pelajaran: belum ada (periksa di layar Pelajaran)",
        f.systemizedRef ? `Sudah disistemkan sebagai: ${f.systemizedRef}` : "",
        "Jenis tindakan (gate / tes / eval / aturan / katalog error): ________",
        `Setelah tindakan diterapkan, tidak ada kegagalan dengan tanda tangan ini selama ${f.windowDays} hari`,
      ]
        .filter(Boolean)
        .join("\n"),
    message: "Kegagalan yang sama terus terulang. Saya mengusulkan PBI pencegahan. Silakan periksa dan setujui bila sudah sesuai.",
  },
} as const

export function asProposalLang(language: string | null | undefined): ProposalLang {
  return language === "en" || language === "id" ? language : "ja"
}

export interface BuiltProposal {
  title: string
  message: string
  proposal: Extract<ChatProposal, { kind: "create_pbi" }>
}

export function buildPreventionProposal(facts: RecurrenceFacts, lang: ProposalLang): BuiltProposal {
  const t = TEXT[lang]
  const label = facts.errorCode ?? facts.tool
  const firstLine = short(facts.signatureText.split("\n")[0] ?? facts.tool, 120)
  const title = short(`${t.titlePrefix}: ${label} ${firstLine}`.trim(), 190)
  const proposal = createPbiProposalSchema.parse({
    kind: "create_pbi",
    proposalId: proposalId(facts.signature),
    title,
    userStory: short(t.story(firstLine), 2000),
    acceptanceCriteria: short(t.ac(facts), 5000),
    storyPoints: null,
    epic: null,
    reason: short(t.why(facts), 1000),
    possibleDuplicates: [],
  })
  return { title, message: t.message, proposal }
}
