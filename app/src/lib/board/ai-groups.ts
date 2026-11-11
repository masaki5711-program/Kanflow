/** Reading the local LLM's answer when it groups sticky notes (B7). Pure. */

/**
 * Groups as the model wrote them, checked: each group a title and the numbers of its notes; every note in exactly one
 * group (notes the model left out go to a last group). Null when nothing usable came back.
 */
export function parseGroups(raw: string, count: number, otherTitle: string): { title: string; items: number[] }[] | null {
  const match = /\[[\s\S]*\]/.exec(raw)
  if (!match) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const seen = new Set<number>()
  const groups: { title: string; items: number[] }[] = []
  for (const g of parsed.slice(0, 12)) {
    if (typeof g !== "object" || g === null) continue
    const title = typeof (g as { title?: unknown }).title === "string" ? (g as { title: string }).title.trim().slice(0, 60) : ""
    const raw = (g as { items?: unknown }).items
    const items = (Array.isArray(raw) ? raw : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= count && !seen.has(n))
    items.forEach((n) => seen.add(n))
    if (title && items.length > 0) groups.push({ title, items: items.map((n) => n - 1) })
  }
  if (groups.length === 0) return null
  const rest = Array.from({ length: count }, (_, i) => i).filter((i) => !seen.has(i + 1))
  if (rest.length > 0) groups.push({ title: otherTitle, items: rest })
  return groups
}
