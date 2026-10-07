/**
 * One-line, human-readable progress of the AI chat ("what is it doing now?").
 * Sent to the client as a transient status frame — never stored in the thread
 * and never fed back to the model (see chat-proposals.ts).
 */

export type StatusLang = "ja" | "en" | "id"

const MAX_DETAIL_CHARS = 60

interface StatusLabels {
  searchDocs: (detail: string) => string
  readFile: (detail: string) => string
  workItem: string
  generic: (toolName: string) => string
  composing: string
}

const LABELS: Record<StatusLang, StatusLabels> = {
  ja: {
    searchDocs: (d) => `リポジトリのドキュメントを検索中${d ? `：「${d}」` : ""}`,
    readFile: (d) => `ファイルを読み込み中${d ? `：${d}` : ""}`,
    workItem: "作業項目の詳細を確認中",
    generic: (n) => `情報を取得中（${n}）`,
    composing: "集めた情報から回答をまとめています",
  },
  en: {
    searchDocs: (d) => `Searching repository docs${d ? `: "${d}"` : ""}`,
    readFile: (d) => `Reading file${d ? `: ${d}` : ""}`,
    workItem: "Checking work item details",
    generic: (n) => `Fetching information (${n})`,
    composing: "Composing the answer from what was gathered",
  },
  id: {
    searchDocs: (d) => `Mencari dokumen repositori${d ? `: "${d}"` : ""}`,
    readFile: (d) => `Membaca berkas${d ? `: ${d}` : ""}`,
    workItem: "Memeriksa detail item pekerjaan",
    generic: (n) => `Mengambil informasi (${n})`,
    composing: "Menyusun jawaban dari informasi yang terkumpul",
  },
}

function detailOf(value: unknown): string {
  if (typeof value !== "string") return ""
  const flat = value.replace(/\s+/g, " ").trim()
  return flat.length > MAX_DETAIL_CHARS ? `${flat.slice(0, MAX_DETAIL_CHARS)}…` : flat
}

/** Status line for a tool the model is about to run. */
export function toolStatusLabel(toolName: string, args: Record<string, unknown> | null | undefined, lang: StatusLang): string {
  const l = LABELS[lang]
  switch (toolName) {
    case "search_repository_docs":
      return l.searchDocs(detailOf(args?.query))
    case "read_repository_file":
      return l.readFile(detailOf(args?.path))
    case "get_work_item_details":
      return l.workItem
    default:
      return l.generic(toolName)
  }
}

/** Status line for the final tool-free answer pass. */
export function composingStatusLabel(lang: StatusLang): string {
  return LABELS[lang].composing
}
