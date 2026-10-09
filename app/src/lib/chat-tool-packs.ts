import type { AILang } from "@/lib/ai-analysis"
import type { ProjectActor } from "@/lib/authz/policy"
import type { ToolDefinition, ToolHandler } from "@/lib/chat-tools-types"
import { PLANNING_TOOL_DEFS, planningHandlers } from "@/lib/analysis-tools-planning"
import { HISTORY_TOOL_DEFS, historyHandlers } from "@/lib/analysis-tools-history"
import { PORTFOLIO_TOOL_DEFS, canViewPortfolio, portfolioHandlers } from "@/lib/analysis-tools-portfolio"
import { PROPOSAL_TOOL_DEFS, proposalHandlers } from "@/lib/proposal-tools"
import { SCHEDULE_TOOL_DEFS, scheduleHandlers } from "@/lib/schedule-tools"

/**
 * Optional tool packs of the chat (P3). The core pack (CHAT_TOOLS in
 * chat-tools.ts: files + the 8 analysis tools) is always offered; these packs
 * are added per request when the recent user messages hint at them, so the
 * prompt (tool schemas + routing guide) stays within the shared num_ctx and
 * the model's decision space stays small.
 *
 * Selection is a cheap keyword heuristic (ja / en / id). A missed pack only
 * means the core tools answer (or the model says it lacks data); the user can
 * rephrase with the keyword.
 */

export type PackName = "planning" | "history" | "portfolio" | "proposals" | "schedule"

interface Pack {
  defs: ToolDefinition[]
  handlers: Record<string, ToolHandler>
  keywords: RegExp
  guide: Record<AILang, string>
}

export const PACKS: Readonly<Record<PackName, Pack>> = {
  planning: {
    defs: PLANNING_TOOL_DEFS,
    handlers: planningHandlers,
    keywords: /全体計画|計画|マイルストーン|リリース|ゴール|目標|カレンダー|予定|スケジュール|日程|来週|今週|今月|来月|plan|milestone|release|goal|calendar|schedule|event|upcoming|next week|rencana|rilis|tujuan|jadwal|kalender|acara|minggu depan/i,
    guide: {
      ja: "- 全体計画の進捗・遅延 → `get_plan_progress` / リリース → `get_release_status` / プロダクトゴール → `get_goal_progress` / 予定・カレンダー → `get_calendar`",
      en: "- Master plan progress/overdue → `get_plan_progress` / releases → `get_release_status` / product goals → `get_goal_progress` / schedule → `get_calendar`",
      id: "- Progres rencana induk → `get_plan_progress` / rilis → `get_release_status` / tujuan produk → `get_goal_progress` / jadwal → `get_calendar`",
    },
  },
  history: {
    defs: HISTORY_TOOL_DEFS,
    handlers: historyHandlers,
    keywords: /比較|前回|前のスプリント|推移|持ち越|スコープ|履歴|変更|更新|最近|活動|アクティビティ|コメント|議論|アイスボックス|icebox|重複|要望|compare|previous|last sprint|carry|scope|history|activity|changed|recent|comment|duplicate|triage|request|banding|sebelumnya|riwayat|aktivitas|perubahan|komentar|duplikat|permintaan/i,
    guide: {
      ja: "- スプリント比較・持ち越し・スコープ変化 → `compare_sprints` / 最近の変更履歴 → `get_recent_activity` / PBI・タスクのコメント → `get_comments` / アイスボックスの棚卸し・重複 → `triage_icebox`",
      en: "- Sprint comparison, carry-over, scope change → `compare_sprints` / recent changes → `get_recent_activity` / comments on an item → `get_comments` / Icebox triage & duplicates → `triage_icebox`",
      id: "- Perbandingan sprint, carry-over, perubahan scope → `compare_sprints` / perubahan terbaru → `get_recent_activity` / komentar item → `get_comments` / triase Icebox & duplikat → `triage_icebox`",
    },
  },
  portfolio: {
    defs: PORTFOLIO_TOOL_DEFS,
    handlers: portfolioHandlers,
    keywords: /ポートフォリオ|全プロジェクト|全案件|部門|課全体|横断|portfolio|all projects|every project|across projects|department|semua proyek|lintas proyek|departemen/i,
    guide: {
      ja: "- 複数プロジェクトの横断状況（管理者・課長のみ） → `portfolio_overview`",
      en: "- Cross-project status (admins / section managers only) → `portfolio_overview`",
      id: "- Status lintas proyek (hanya admin / manajer seksi) → `portfolio_overview`",
    },
  },
  proposals: {
    defs: PROPOSAL_TOOL_DEFS,
    handlers: proposalHandlers,
    keywords: /作成|作って|追加|起票|登録|分割|分解|タスク化|ステータス|完了にし|変更して|変えて|移して|入れて|外して|提案|アイスボックス|icebox|create|add|draft|new pbi|split|break down|status|mark as|move to|put .* in|propose|buat|tambah|pecah|ubah status|tandai|usulkan|masukkan/i,
    guide: {
      ja:
        "### 書き込みの提案（承認制）\n" +
        "- PBI 作成 → `propose_pbi` / タスク分割 → `propose_task_split` / ステータス変更 → `propose_status_change` / Icebox に追加 → `propose_icebox` / PBI をスプリントへ入れる・外す → `propose_sprint_pbi`\n" +
        "- これらは**提案のみで何も書き込まない**。画面に承認カードが出るので「カードの［承認］で反映されます」と伝える。作成・変更済みと言ってはならない。",
      en:
        "### Write proposals (approval required)\n" +
        "- Create PBI → `propose_pbi` / split into tasks → `propose_task_split` / change status → `propose_status_change` / add to Icebox → `propose_icebox` / put a PBI into or out of a sprint → `propose_sprint_pbi`\n" +
        "- These only PROPOSE; nothing is written. The UI shows an approval card — tell the user to press Approve on it. Never claim it was created or changed.",
      id:
        "### Usulan penulisan (perlu persetujuan)\n" +
        "- Buat PBI → `propose_pbi` / pecah jadi tugas → `propose_task_split` / ubah status → `propose_status_change` / tambah ke Icebox → `propose_icebox` / masukkan atau keluarkan PBI dari sprint → `propose_sprint_pbi`\n" +
        "- Alat ini hanya MENGUSULKAN; tidak ada yang ditulis. UI menampilkan kartu persetujuan — minta pengguna menekan Setujui. Jangan mengatakan sudah dibuat/diubah.",
    },
  },
  schedule: {
    defs: SCHEDULE_TOOL_DEFS,
    handlers: scheduleHandlers,
    keywords: /スケジュール|日程|日付|期間|開始日|終了日|ずらし|ずらす|遅ら|前倒し|延期|後ろ倒し|テンプレート|ひな形|雛形|工程|フェーズ|schedule|reschedule|postpone|delay|bring forward|shift|template|timeline|phase|stage|jadwal|tunda|geser|majukan|templat|tahap|fase/i,
    guide: {
      ja:
        "### スケジュール調整・テンプレート作成（承認制）\n" +
        "- 現状把握が先: 全体計画 → `list_plan_schedule` / スプリントの期間と中身 → `list_sprint_schedule`。見ずに日付を提案してはならない。\n" +
        "- 全体計画の追加・日付変更・日数ずらし → `propose_plan_edit`（日付の足し算は自分でせず、`shift` に日数を渡す）/ スプリント期間の変更 → `propose_sprint_schedule` / 計画テンプレート → `propose_template`\n" +
        "- テンプレートは会話で作る: まず目的・段階・期間・完了条件を質問し、段階の案を箇条書きで示して合意を得てから `propose_template` を呼ぶ。公開範囲は既定で自分だけ。\n" +
        "- 提案のみで何も書き込まない。カードの［承認］で反映されると伝え、変更済みと言ってはならない。",
      en:
        "### Schedule adjustment & templates (approval required)\n" +
        "- Look first: master plan → `list_plan_schedule` / sprint periods and contents → `list_sprint_schedule`. Never propose dates without reading them.\n" +
        "- Add stages, change dates, shift by N days → `propose_plan_edit` (never add days yourself; pass the number of days to `shift`) / sprint period → `propose_sprint_schedule` / plan template → `propose_template`\n" +
        "- Build templates in conversation: ask the purpose, stages, durations and done criteria, show the outline as a list and get agreement before calling `propose_template`. Visibility defaults to private.\n" +
        "- These only PROPOSE; nothing is written. Tell the user to press Approve on the card; never claim it was changed.",
      id:
        "### Penyesuaian jadwal & templat (perlu persetujuan)\n" +
        "- Lihat dulu: rencana induk → `list_plan_schedule` / periode dan isi sprint → `list_sprint_schedule`. Jangan mengusulkan tanggal tanpa membacanya.\n" +
        "- Tambah tahap, ubah tanggal, geser N hari → `propose_plan_edit` (jangan menghitung hari sendiri; berikan jumlah hari ke `shift`) / periode sprint → `propose_sprint_schedule` / templat rencana → `propose_template`\n" +
        "- Buat templat lewat percakapan: tanyakan tujuan, tahap, durasi, kriteria selesai, tampilkan kerangka sebagai daftar dan minta persetujuan sebelum `propose_template`. Visibilitas default: pribadi.\n" +
        "- Alat ini hanya MENGUSULKAN. Minta pengguna menekan Setujui pada kartu; jangan mengatakan sudah diubah.",
    },
  },
}

const PACK_ORDER: readonly PackName[] = ["planning", "history", "portfolio", "proposals", "schedule"]

/** How many recent user messages are scanned (follow-ups keep the pack). */
const RECENT_USER_MESSAGES = 3

export interface PackSelectionInput {
  messages: ReadonlyArray<{ role: string; content: string }>
  actor?: ProjectActor
}

/** Pure: which optional packs to offer for this request. */
export function selectPacks({ messages, actor }: PackSelectionInput): PackName[] {
  const recent = messages
    .filter((m) => m.role === "user")
    .slice(-RECENT_USER_MESSAGES)
    .map((m) => m.content)
    .join("\n")
  return PACK_ORDER.filter((name) => {
    // Never offer the portfolio to users who would only get a refusal.
    if (name === "portfolio" && !canViewPortfolio(actor)) return false
    return PACKS[name].keywords.test(recent)
  })
}

/** Tool definitions of the selected packs (append to the core CHAT_TOOLS). */
export function packToolDefs(packs: readonly PackName[]): ToolDefinition[] {
  return packs.flatMap((p) => PACKS[p].defs)
}

/** Routing-guide lines for the selected packs ("" when none). */
export function packGuide(packs: readonly PackName[], lang: AILang): string {
  if (packs.length === 0) return ""
  return `\n### 追加ツール / Extra tools\n${packs.map((p) => PACKS[p].guide[lang]).join("\n")}`
}

/** Every pack handler by tool name (dispatch works even for a pack not offered this turn). */
export const packHandlers: Readonly<Record<string, ToolHandler>> = Object.freeze(
  Object.assign({}, ...PACK_ORDER.map((p) => PACKS[p].handlers)) as Record<string, ToolHandler>
)

/** Every pack tool definition (docs, tests, token budget checks). */
export const ALL_PACK_TOOL_DEFS: readonly ToolDefinition[] = PACK_ORDER.flatMap((p) => PACKS[p].defs)
