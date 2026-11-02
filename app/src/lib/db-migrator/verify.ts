/**
 * Verification: per table, both sides are streamed in the SAME order - the
 * primary key compared as UTF-8 bytes (MySQL `CAST(col AS BINARY)`,
 * PostgreSQL `col::text COLLATE "C"`; integer key parts numerically) - and
 * each row is reduced to its canonical serialization (convert.ts).
 *
 * - count and SHA-256 over the ordered canonical rows, per side;
 * - a merge walk over the two ordered streams names the first differing keys
 *   (missing in target / extra in target / content differs) with bounded memory.
 *
 * The native collations cannot be used for the order: utf8mb4_unicode_ci and
 * ICU "und" sort text differently, so the streams would not line up.
 */
import { createHash } from "node:crypto"
import type { TargetKind } from "./convert"

export interface KeyedRow {
  key: (string | null)[]
  canon: string
}

export type DifferenceKind = "missing-in-target" | "extra-in-target" | "content-differs"

export interface Difference {
  kind: DifferenceKind
  key: string
}

export interface TableComparison {
  table: string
  sourceRows: number
  targetRows: number
  sourceHash: string
  targetHash: string
  match: boolean
  differenceCount: number
  differences: Difference[]
}

export function compareKeys(a: readonly (string | null)[], b: readonly (string | null)[], kinds: readonly TargetKind[]): number {
  for (let i = 0; i < kinds.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x === y) continue
    if (x === null) return -1
    if (y === null) return 1
    if (kinds[i] === "integer") {
      const d = BigInt(x) - BigInt(y)
      if (d !== BigInt(0)) return d < BigInt(0) ? -1 : 1
      continue
    }
    const c = Buffer.compare(Buffer.from(x, "utf8"), Buffer.from(y, "utf8"))
    if (c !== 0) return c
  }
  return 0
}

export function formatKey(key: readonly (string | null)[]): string {
  return key.length === 1 ? String(key[0]) : JSON.stringify(key)
}

export async function compareSortedStreams(
  table: string,
  source: AsyncIterable<KeyedRow>,
  target: AsyncIterable<KeyedRow>,
  keyKinds: readonly TargetKind[],
  maxDifferences = 20,
): Promise<TableComparison> {
  const sh = createHash("sha256")
  const th = createHash("sha256")
  const si = source[Symbol.asyncIterator]()
  const ti = target[Symbol.asyncIterator]()
  let sourceRows = 0
  let targetRows = 0
  let differenceCount = 0
  const differences: Difference[] = []
  const note = (kind: DifferenceKind, key: (string | null)[]): void => {
    differenceCount++
    if (differences.length < maxDifferences) differences.push({ kind, key: formatKey(key) })
  }
  const nextS = async (): Promise<KeyedRow | null> => {
    const r = await si.next()
    if (r.done) return null
    sourceRows++
    sh.update(`${r.value.canon}\n`)
    return r.value
  }
  const nextT = async (): Promise<KeyedRow | null> => {
    const r = await ti.next()
    if (r.done) return null
    targetRows++
    th.update(`${r.value.canon}\n`)
    return r.value
  }

  let s = await nextS()
  let t = await nextT()
  while (s !== null || t !== null) {
    if (t === null || (s !== null && compareKeys(s.key, t.key, keyKinds) < 0)) {
      note("missing-in-target", s!.key)
      s = await nextS()
    } else if (s === null || compareKeys(s.key, t.key, keyKinds) > 0) {
      note("extra-in-target", t.key)
      t = await nextT()
    } else {
      if (s.canon !== t.canon) note("content-differs", s.key)
      s = await nextS()
      t = await nextT()
    }
  }
  const sourceHash = sh.digest("hex")
  const targetHash = th.digest("hex")
  return {
    table,
    sourceRows,
    targetRows,
    sourceHash,
    targetHash,
    match: differenceCount === 0 && sourceRows === targetRows && sourceHash === targetHash,
    differenceCount,
    differences,
  }
}
