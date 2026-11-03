/**
 * Verification, table by table, in bounded statements:
 *
 * - the source is read in keyset chunks in its own primary-key order (index
 *   range scans, one bounded statement per chunk - no table-long stream);
 * - for each chunk the target rows with the same keys are fetched by key;
 * - every row is reduced to its canonical serialization (convert.ts) and the
 *   pairs are compared: missing in target / content differs;
 * - SHA-256 over the canonical rows in source key order is kept per side;
 * - counts are compared; when the target has more rows than were matched, an
 *   extra-key pass (target keys checked against the source) names them.
 *
 * Keys are compared as canonical text, so the order of the two engines'
 * collations does not matter.
 */
import { createHash, type Hash } from "node:crypto"

export interface VerifyRow {
  /** formatted canonical primary key */
  key: string
  canon: string
}

export type DifferenceKind = "missing-in-target" | "extra-in-target" | "content-differs" | "sequence-behind"

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

export function formatKey(key: readonly (string | null)[]): string {
  return key.length === 1 ? String(key[0]) : JSON.stringify(key)
}

export class TableVerifier {
  private readonly sh: Hash = createHash("sha256")
  private readonly th: Hash = createHash("sha256")
  private matchedRows = 0
  private count = 0
  private readonly diffs: Difference[] = []

  constructor(
    readonly table: string,
    private readonly maxDifferences = 20,
  ) {}

  get matched(): number {
    return this.matchedRows
  }

  private note(kind: DifferenceKind, key: string): void {
    this.count++
    if (this.diffs.length < this.maxDifferences) this.diffs.push({ kind, key })
  }

  /** One source chunk (in source key order) and the target rows found for its keys. */
  addChunk(source: readonly VerifyRow[], target: ReadonlyMap<string, string>): void {
    for (const s of source) {
      this.sh.update(`${s.canon}\n`)
      const t = target.get(s.key)
      if (t === undefined) {
        this.note("missing-in-target", s.key)
        continue
      }
      this.matchedRows++
      this.th.update(`${t}\n`)
      if (t !== s.canon) this.note("content-differs", s.key)
    }
  }

  addExtras(keys: readonly string[]): void {
    for (const k of keys) {
      this.th.update(`!extra ${k}\n`)
      this.note("extra-in-target", k)
    }
  }

  addProblem(kind: DifferenceKind, key: string): void {
    this.note(kind, key)
  }

  result(sourceRows: number, targetRows: number): TableComparison {
    const sourceHash = this.sh.digest("hex")
    const targetHash = this.th.digest("hex")
    return {
      table: this.table,
      sourceRows,
      targetRows,
      sourceHash,
      targetHash,
      match: this.count === 0 && sourceRows === targetRows && this.matchedRows === targetRows && sourceHash === targetHash,
      differenceCount: this.count,
      differences: this.diffs,
    }
  }
}
