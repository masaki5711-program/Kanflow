/**
 * Legacy local-time detection, per table and per timestamp column.
 *
 * Builds before 2026-10 wrote some timestamps with MySQL NOW(3) / DEFAULT
 * CURRENT_TIMESTAMP(3) in server local time (UTC+7) while Prisma wrote UTC
 * (docs/operations/worker.md). The value is never shifted; every suspicious
 * row is REPORTED and a migrate run refuses until the operator accepts the
 * codes (--accept-warnings). Probes:
 *
 *   FUTURE_TIMESTAMP          event timestamp (name ends in At / _at) more than 10 min
 *                             ahead of UTC now (expiresAt excluded: legitimately future)
 *   TIMESTAMP_BEFORE_CREATED  event timestamp more than 1 h before the row's createdAt
 *                             (columns that may legitimately precede creation excluded:
 *                             remote / capture times such as mergedAt, takenAt)
 *   LOCAL_OFFSET_SUSPECT      |event - createdAt| within +-10 min of the local offset
 *                             (7 h): the signature of one side written in local time
 *   LOCAL_TIME_SUSPECT        known pipeline orders, e.g. field_translation.requested_at
 *                             later than its own translated_at / started_at + 1 h
 *
 * Coverage is recorded for every timestamp column: which probes ran and why the
 * others could not (planning dates, no createdAt sibling). The report never
 * claims "nothing found" for a column that was not looked at.
 */
import type { IssueCode, TableMapping } from "./prechecks"
import { myIdent } from "./sql"

export interface TimestampCheck {
  code: IssueCode
  column: string
  expr: string
  message: string
}

export interface TimestampCoverage {
  table: string
  column: string
  probes: string[]
  notProbed: { probe: string; reason: string }[]
}

const FUTURE_TOLERANCE_MIN = 10
const EVENT = /(At|_at)$/
const FUTURE_OK = new Set(["expiresAt", "expires_at"])
/** Times taken from elsewhere (remote systems, capture devices) can predate the row. */
const MAY_PRECEDE_CREATION = new Set([
  "takenAt",
  "occurredAt",
  "mergedAt",
  "releasedAt",
  "declaredAt",
  "commitCursorAt",
  "mrCursorAt",
  "lookbackAt",
  "lookbackCursorAt",
  "syncedAt",
])
const CREATED = ["createdAt", "created_at"]

/** Known pipeline orders: the column can never be later than these siblings (+1 h). */
export const LOCAL_TIME_PROBES = [{ table: "field_translation", column: "requested_at", laterThan: ["translated_at", "started_at"] }]

export function planTimestampProbes(m: TableMapping, localOffsetHours: number): { checks: TimestampCheck[]; coverage: TimestampCoverage[] } {
  const ts = m.columns.filter(
    (c) => (c.kind === "timestamp" || c.kind === "timestamptz") && (c.sourceType === "datetime" || c.sourceType === "timestamp"),
  )
  const names = new Set(m.columns.map((c) => c.name))
  const created = CREATED.find((c) => names.has(c)) ?? null
  const checks: TimestampCheck[] = []
  const coverage: TimestampCoverage[] = []
  const lo = localOffsetHours * 3600 - FUTURE_TOLERANCE_MIN * 60
  const hi = localOffsetHours * 3600 + FUTURE_TOLERANCE_MIN * 60

  for (const c of ts) {
    const q = myIdent(c.name)
    const cov: TimestampCoverage = { table: m.table, column: c.name, probes: [], notProbed: [] }
    const isEvent = EVENT.test(c.name)
    if (!isEvent) {
      cov.notProbed.push({ probe: "all", reason: "business / planning date (name does not end in At/_at): future and ordering are legitimate" })
      coverage.push(cov)
      continue
    }
    if (FUTURE_OK.has(c.name)) cov.notProbed.push({ probe: "future", reason: "legitimately in the future" })
    else {
      checks.push({
        code: "FUTURE_TIMESTAMP",
        column: c.name,
        expr: `${q} > UTC_TIMESTAMP(3) + INTERVAL ${FUTURE_TOLERANCE_MIN} MINUTE`,
        message: `more than ${FUTURE_TOLERANCE_MIN} min ahead of UTC now: written in server local time? copied unchanged`,
      })
      cov.probes.push("future")
    }
    if (created === null) {
      cov.notProbed.push({ probe: "before-created", reason: "table has no createdAt sibling" }, { probe: "offset", reason: "table has no createdAt sibling" })
    } else if (c.name !== created) {
      const cq = myIdent(created)
      if (MAY_PRECEDE_CREATION.has(c.name)) cov.notProbed.push({ probe: "before-created", reason: "may legitimately precede creation (remote / capture time)" })
      else {
        checks.push({
          code: "TIMESTAMP_BEFORE_CREATED",
          column: c.name,
          expr: `${q} < ${cq} - INTERVAL 1 HOUR`,
          message: `more than 1 h before ${created}: one of the two written in local time? copied unchanged`,
        })
        cov.probes.push("before-created")
      }
      checks.push({
        code: "LOCAL_OFFSET_SUSPECT",
        column: c.name,
        expr: `ABS(TIMESTAMPDIFF(SECOND, ${cq}, ${q})) BETWEEN ${lo} AND ${hi}`,
        message: `exactly ${localOffsetHours} h (+-${FUTURE_TOLERANCE_MIN} min) away from ${created}: local-time signature; copied unchanged`,
      })
      cov.probes.push("offset")
    }
    for (const p of LOCAL_TIME_PROBES) {
      if (p.table !== m.table || p.column !== c.name || !p.laterThan.every((x) => names.has(x))) continue
      checks.push({
        code: "LOCAL_TIME_SUSPECT",
        column: c.name,
        expr: `${q} > COALESCE(${p.laterThan.map(myIdent).join(", ")}) + INTERVAL 1 HOUR`,
        message: `later than ${p.laterThan.join(" / ")} + 1 h: legacy server-local-time (UTC+7) write; copied unchanged`,
      })
      cov.probes.push("pipeline-order")
    }
    coverage.push(cov)
  }
  return { checks, coverage }
}
