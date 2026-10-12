/**
 * Pasted-table → plan rows (表から取り込み). Pure. Columns: 項目名 / 開始 /
 * 終了 / 担当者 / 階層. The level comes from the 5th column when it holds a
 * number, else from the indentation of the name (2 spaces or one full-width
 * space per level). A header row is skipped. Tab-separated text is
 * what Excel and Google Sheets put on the clipboard; comma text is accepted
 * when there is no tab at all.
 */
import { diffDays } from "./date"
import { parseDateInput } from "./date-input"
import type { Ymd } from "./plan-types"
import type { ImportErrorCode } from "./schedule-api"

export const IMPORT_MAX_ROWS = 500
export const IMPORT_MAX_DEPTH = 5

export interface ImportMember {
  id: string
  name: string
}

export interface ParsedRow {
  /** 1-based line number in the pasted text (blank lines are counted). */
  line: number
  depth: number
  name: string
  start: Ymd | null
  end: Ymd | null
  ownerText: string
  ownerId: string | null
  error: ImportErrorCode | null
}

const HEADER_NAME = /^(項目名?|名前|名称|タスク|工程|name|task|nama)$/i
const HEADER_START = /(開始|start|mulai)/i

const norm = (s: string): string => s.normalize("NFKC").trim().toLowerCase()

function unquote(cell: string): string {
  const c = cell.trim()
  return c.length >= 2 && c.startsWith('"') && c.endsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c
}

/**
 * Level encoded by the leading spaces of the raw line (2 half-width or 1
 * full-width space per level); returns it and the rest. Tabs are never
 * indentation: a leading tab is an empty first cell.
 */
function leadingLevel(raw: string): { level: number; rest: string } {
  const spaces = /^[ 　]+/.exec(raw)?.[0] ?? ""
  const wide = [...spaces].filter((c) => c === "　").length
  const narrow = spaces.length - wide
  return { level: wide + Math.ceil(narrow / 2), rest: raw.slice(spaces.length) }
}

function splitCells(line: string, csv: boolean): string[] {
  return (csv ? line.split(",") : line.split("\t")).map(unquote)
}

function matchOwner(text: string, members: readonly ImportMember[]): string | null {
  const key = norm(text)
  const exact = members.filter((m) => norm(m.name) === key)
  if (exact.length === 1) return exact[0].id
  const partial = members.filter((m) => norm(m.name).includes(key) || key.includes(norm(m.name)))
  return exact.length === 0 && partial.length === 1 ? partial[0].id : null
}

function dateError(startText: string, endText: string, start: Ymd | null, end: Ymd | null): ImportErrorCode | null {
  const blank = (s: string) => s.trim() === ""
  if (blank(startText) && blank(endText)) return null
  if (blank(startText) !== blank(endText) || !start || !end) return "dates"
  return diffDays(start, end) < 0 ? "order" : null
}

interface Parsed {
  rows: ParsedRow[]
  /** More rows than IMPORT_MAX_ROWS were pasted (the rest was dropped). */
  truncated: boolean
}

export function parseImportText(text: string, today: Ymd, members: readonly ImportMember[]): Parsed {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "")
  // Comma text only when every line has a comma: a single-column paste may hold commas in names.
  const csv = !text.includes("\t") && lines.length > 0 && lines.every((l) => l.includes(","))
  const rows: ParsedRow[] = []
  let truncated = false
  let previousDepth = -1
  let headerChecked = false

  text.split(/\r?\n/).forEach((raw, index) => {
    if (raw.trim() === "") return
    const { level, rest } = csv ? { level: 0, rest: raw } : leadingLevel(raw)
    const cells = splitCells(csv ? raw.trim() : rest, csv)
    if (!headerChecked) {
      headerChecked = true
      if (HEADER_NAME.test(cells[0]?.trim() ?? "") || HEADER_START.test(cells[1] ?? "")) return
    }
    if (rows.length >= IMPORT_MAX_ROWS) {
      truncated = true
      return
    }
    const levelCell = (cells[4] ?? "").trim()
    const explicitLevel = /^\d+$/.test(levelCell) ? Number(levelCell) : null
    const depth = explicitLevel ?? level
    const name = (cells[0] ?? "").trim()
    const startText = cells[1] ?? ""
    const endText = cells[2] ?? ""
    const ownerText = (cells[3] ?? "").trim()
    const start = startText.trim() ? parseDateInput(startText, today) : null
    const end = endText.trim() ? parseDateInput(endText, today) : null
    const ownerId = ownerText ? matchOwner(ownerText, members) : null

    let error: ImportErrorCode | null = null
    if (!name) error = "name"
    else if (depth > IMPORT_MAX_DEPTH || depth > previousDepth + 1) error = "depth"
    else error = dateError(startText, endText, start, end) ?? (ownerText && !ownerId ? "owner" : null)

    previousDepth = error === "depth" ? previousDepth : depth
    rows.push({ line: index + 1, depth, name, start, end, ownerText, ownerId, error })
  })
  return { rows, truncated }
}
