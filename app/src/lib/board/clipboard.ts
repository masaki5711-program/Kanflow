import { BOARD_LIMITS } from "./limits"

/**
 * What a paste from another program becomes. A spreadsheet range (Excel, LibreOffice, Google Sheets) arrives as
 * tab-separated text — Excel quotes a cell that holds a line break or a quote — and usually as an HTML table too.
 * Pure (the HTML is read with the DOMParser the caller passes).
 */

export type Cells = string[][]

/** Cuts the grid to the table limits and pads short rows; null when nothing is left. */
export function boundCells(rows: readonly (readonly string[])[]): Cells | null {
  const kept = rows.slice(0, BOARD_LIMITS.tableRows).map((row) => row.slice(0, BOARD_LIMITS.tableCols).map((cell) => cell.slice(0, BOARD_LIMITS.tableCellLength)))
  // Excel ends a copied range with a line break: no empty last row.
  while (kept.length > 0 && kept[kept.length - 1].every((cell) => cell === "")) kept.pop()
  const cols = kept.reduce((max, row) => Math.max(max, row.length), 0)
  if (kept.length === 0 || cols === 0) return null
  return kept.map((row) => [...row, ...Array.from({ length: cols - row.length }, () => "")])
}

/**
 * Tab-separated text as a grid, or null when the text has no tab (a plain text paste). Quoted cells may hold
 * tabs, line breaks and doubled quotes.
 */
export function parseTsv(text: string): Cells | null {
  if (!text.includes("\t")) return null
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  let i = 0
  const s = text.replace(/\r\n?/g, "\n")
  while (i < s.length) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"'
        i += 2
        continue
      }
      if (ch === '"') quoted = false
      else cell += ch
      i += 1
      continue
    }
    if (ch === '"' && cell === "") quoted = true
    else if (ch === "\t") {
      row.push(cell)
      cell = ""
    } else if (ch === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
    i += 1
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return boundCells(rows)
}

/** The first HTML table of a paste as a grid (merged cells are not spread out), or null. */
export function parseHtmlTable(html: string, parse: (html: string) => Document): Cells | null {
  if (!/<table[\s>]/i.test(html)) return null
  const table = parse(html).querySelector("table")
  if (!table) return null
  const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.querySelectorAll("th,td")).map((cell) => (cell.textContent ?? "").replace(/ /g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").trim()),
  )
  return boundCells(rows)
}
