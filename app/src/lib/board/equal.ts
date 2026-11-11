/**
 * Structural equality of JSON values (objects compared by keys, whatever their order — PostgreSQL's jsonb
 * does not keep key order). `undefined` properties count as absent, as JSON drops them.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => jsonEqual(item, b[i]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const leftKeys = Object.keys(left).filter((k) => left[k] !== undefined)
  const rightKeys = Object.keys(right).filter((k) => right[k] !== undefined)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((k) => Object.prototype.hasOwnProperty.call(right, k) && jsonEqual(left[k], right[k]))
}
