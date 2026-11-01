/** `ref`: the PBI id, its display number ("12") or "PBI-12" (pure; shared by the v1 API, the MCP tools and 受入基準). */
export function parsePbiRef(ref: string): { id: string } | { displayId: number } {
  const m = /^(?:pbi-?)?(\d{1,9})$/i.exec(ref.trim())
  return m ? { displayId: Number(m[1]) } : { id: ref }
}
