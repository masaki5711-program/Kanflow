import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Connection, RowDataPacket } from "mysql2/promise"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { parseEndpoint } from "../args"
import { cliMain } from "../cli"
import { runWithConnections } from "../connect"
import { openMysqlSource } from "../mysql-port"
import { openPgTarget } from "../pg-port"
import { runMigrator, type InvalidJsonRecord, type MigrationReport, type RunHooks, type RunOptions, type WarningBaseline } from "../run"
import { myIdent, pgIdent } from "../sql"
import { applyMysqlSchema, dropAllTables, injectDefect, openSeedConnection, seedSynthetic } from "../../../../scripts/seed-mysql-synthetic"

/**
 * End to end against the two SYNTHETIC rehearsal containers of
 * ops/test-env/migrator-compose.yml (never production, never another agent's DB):
 *
 *   docker compose -p kanflow-k2-test -f ops/test-env/migrator-compose.yml up -d --wait
 *   KANFLOW_MIGRATOR_TESTS=1 npx vitest run src/lib/db-migrator/__tests__/migrator.integration.test.ts
 *
 * Uses its own databases: MySQL `scrum_tool_it_synthetic` (frozen MySQL migrations + seed)
 * and PostgreSQL `scrum_tool_it` (re-created, `prisma migrate deploy`).
 * Ports can be moved with K2_IT_MYSQL_PORT / K2_IT_PG_PORT (loopback only); the
 * production / shared ports 3306, 5432 and 25434 are refused.
 */
const enabled = process.env.KANFLOW_MIGRATOR_TESTS === "1"
const MY_PORT = Number(process.env.K2_IT_MYSQL_PORT ?? 23306)
const PG_PORT = Number(process.env.K2_IT_PG_PORT ?? 25435)
const FORBIDDEN_PORTS = new Set([3306, 5432, 25434])
if (enabled && (FORBIDDEN_PORTS.has(MY_PORT) || FORBIDDEN_PORTS.has(PG_PORT))) {
  throw new Error(`refusing to run the migrator integration tests against port ${MY_PORT}/${PG_PORT} (production / shared databases)`)
}
const MY_DB = "scrum_tool_it_synthetic"
const PG_DB = "scrum_tool_it"
const APP_DIR = path.resolve(__dirname, "..", "..", "..", "..")
const SECRETS = { mysqlApp: "k2_app_synthetic", mysqlReader: "k2_reader_synthetic", pg: "k2_pg_synthetic" }
/** What the synthetic seed deliberately contains (legacy local-time rows), reviewed and accepted. */
const SEEDED_WARNINGS = ["FUTURE_TIMESTAMP", "LOCAL_OFFSET_SUSPECT", "LOCAL_TIME_SUSPECT", "TIMESTAMP_BEFORE_CREATED"]

const sourceEp = parseEndpoint(`mysql://k2_reader@127.0.0.1:${MY_PORT}/${MY_DB}`, "mysql", "--source")
const seedEp = parseEndpoint(`mysql://k2_app@127.0.0.1:${MY_PORT}/${MY_DB}`, "mysql", "--source")
const targetEp = parseEndpoint(`postgresql://k2_pg@127.0.0.1:${PG_PORT}/${PG_DB}`, "postgresql", "--target")
const TIMEOUT_MS = 60_000

async function pgClient(database: string): Promise<Client> {
  const c = new Client({ host: "127.0.0.1", port: PG_PORT, user: "k2_pg", password: SECRETS.pg, database, connectionTimeoutMillis: 10_000 })
  await c.connect()
  return c
}

let identities = { source: "", target: "" }
let warningBaseline: WarningBaseline | null = null
let dryRunReportFile = ""

async function run(mode: RunOptions["mode"], extra: Partial<RunOptions> = {}, hooks: RunHooks = {}): Promise<MigrationReport> {
  const source = await openMysqlSource(sourceEp, SECRETS.mysqlReader, TIMEOUT_MS)
  const target = await openPgTarget(targetEp, SECRETS.pg, { readOnly: mode !== "migrate", statementTimeoutMs: TIMEOUT_MS })
  try {
    return await runMigrator(
      {
        mode,
        batchSize: 50,
        allowInvalidJson: false,
        acceptWarnings: SEEDED_WARNINGS,
        expectSourceIdentity: identities.source,
        expectTargetIdentity: identities.target,
        warningBaseline,
        ...extra,
      },
      { source, target },
      hooks,
    )
  } finally {
    await source.close()
    await target.close()
  }
}

describe.skipIf(!enabled)("MySQL -> PostgreSQL migrator on synthetic containers (KANFLOW_MIGRATOR_TESTS=1)", () => {
  let seedConn: Connection
  let pg: Client
  let appTables: string[] = []
  let seeded = 0
  let seededEmails: string[] = []

  const totalTargetRows = async (): Promise<number> => {
    const r = await pg.query<{ n: string }>(appTables.map((t) => `SELECT COUNT(*) AS n FROM ${pgIdent(t)}`).join(" UNION ALL "))
    return r.rows.reduce((a, x) => a + Number(x.n), 0)
  }
  const emptyTarget = async (): Promise<void> => {
    await pg.query(`TRUNCATE ${appTables.map(pgIdent).join(", ")}`)
  }

  beforeAll(async () => {
    const admin = await pgClient("scrum_tool")
    await admin.query(`DROP DATABASE IF EXISTS ${pgIdent(PG_DB)} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${pgIdent(PG_DB)} TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'und' LOCALE 'C.UTF-8'`)
    await admin.end()
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], {
      cwd: APP_DIR,
      env: { ...process.env, DATABASE_URL: `postgresql://k2_pg:${SECRETS.pg}@127.0.0.1:${PG_PORT}/${PG_DB}` },
      stdio: "pipe",
      shell: process.platform === "win32",
      timeout: 180_000,
    })
    pg = await pgClient(PG_DB)
    const t = await pg.query<{ t: string }>("SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1")
    appTables = t.rows.map((r) => r.t)

    seedConn = await openSeedConnection(seedEp, SECRETS.mysqlApp)
    const [rows] = await seedConn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")
    if (Number(rows[0].n) !== appTables.length) {
      await dropAllTables(seedConn)
      await applyMysqlSchema(seedConn, path.join(APP_DIR, "prisma", "migrations-mysql"))
    } else {
      await seedConn.query("SET FOREIGN_KEY_CHECKS = 0")
      const [names] = await seedConn.query<RowDataPacket[]>("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")
      for (const r of names) await seedConn.query(`DELETE FROM ${myIdent(String(r.t))}`)
      await seedConn.query("SET FOREIGN_KEY_CHECKS = 1")
    }
    seeded = (await seedSynthetic(seedConn, { rowsPerTable: 5, seed: 7 })).rows
    const [emails] = await seedConn.query<RowDataPacket[]>("SELECT email FROM `user`")
    seededEmails = emails.map((r) => String(r.email))

    // The identities a real operator copies from the dry run's output.
    const source = await openMysqlSource(sourceEp, SECRETS.mysqlReader, TIMEOUT_MS)
    const target = await openPgTarget(targetEp, SECRETS.pg, { readOnly: true, statementTimeoutMs: TIMEOUT_MS })
    identities = { source: (await source.serverInfo()).identity, target: (await target.serverInfo()).identity }
    await source.close()
    await target.close()
    // The reviewed dry run: its warnings bound what a migrate run may accept.
    const dry = await run("dry-run", { acceptWarnings: [] })
    warningBaseline = { sourceIdentity: identities.source, warnings: dry.precheck.warnings.map((w) => ({ code: w.code, table: w.table, column: w.column, count: w.count })) }
    dryRunReportFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "k2-it-")), "dry-run.json")
    fs.writeFileSync(dryRunReportFile, JSON.stringify(dry))
  }, 600_000)

  afterAll(async () => {
    await seedConn?.end()
    await pg?.end()
  })

  it("--dry-run: no errors, the seeded local-time rows need a decision (exit 4), the target stays empty", async () => {
    const r = await run("dry-run", { acceptWarnings: [] })
    expect(r.precheck.errors).toEqual([])
    expect(r).toMatchObject({ outcome: "needs-decision", exitCode: 4 })
    expect([...r.unacceptedWarnings].sort()).toEqual(SEEDED_WARNINGS)
    expect(Object.values(r.sourceCounts).reduce((a, b) => a + b, 0)).toBe(seeded)
    const req = r.timestampAnalysis.find((c) => c.table === "field_translation" && c.column === "requested_at")
    expect(req?.notProbed.map((n) => n.probe)).toEqual(["before-created", "offset"])
    expect(await totalTargetRows()).toBe(0)
  }, 120_000)

  it("a migrate run refuses unaccepted warnings (exit 2) and a server other than the dry run's", async () => {
    const r = await run("migrate", { acceptWarnings: ["FUTURE_TIMESTAMP"] })
    expect(r).toMatchObject({ outcome: "precheck-failed", exitCode: 2, committed: false })
    const r2 = await run("migrate", { expectTargetIdentity: "0000/1" })
    expect(r2.precheck.errors.map((e) => e.code)).toEqual(["IDENTITY_MISMATCH"])
    expect(await totalTargetRows()).toBe(0)
  }, 120_000)

  it("copies, verifies inside the transaction, commits; local-time rows are reported and not shifted", async () => {
    const r = await run("migrate")
    expect(r.error).toBeUndefined()
    expect(r).toMatchObject({ outcome: "ok", exitCode: 0, committed: true, analyze: "ok" })
    expect(r.verification).toMatchObject({ insideTransaction: true, mismatched: [] })
    expect(r.verification?.tables).toHaveLength(appTables.length)
    expect(r.copy?.tables.reduce((a, t) => a + t.rows, 0)).toBe(seeded)
    expect(r.copy?.deferredUpdates).toBeGreaterThan(0)
    expect(await totalTargetRows()).toBe(seeded)
    const count = (code: string) => r.precheck.warnings.filter((w) => w.code === code).reduce((a, w) => a + w.count, 0)
    expect(count("LOCAL_TIME_SUSPECT")).toBe(3)
    expect(count("FUTURE_TIMESTAMP")).toBe(1)
    expect(r.precheck.warnings.find((w) => w.code === "TIMESTAMP_BEFORE_CREATED")).toMatchObject({ table: "User", column: "updatedAt", count: 1 })
    expect(r.precheck.warnings.find((w) => w.code === "LOCAL_OFFSET_SUSPECT")).toMatchObject({ table: "User", column: "updatedAt", count: 1 })
    expect(r.acceptedWarnings.map((w) => w.code).sort()).toEqual(SEEDED_WARNINGS)
    const shifted = await pg.query<{ n: string }>(`SELECT COUNT(*) AS n FROM field_translation WHERE requested_at > translated_at + interval '6 hours'`)
    expect(Number(shifted.rows[0].n)).toBe(3)
  }, 120_000)

  it("verify-only: a corrupted and a missing target row fail verification and are named", async () => {
    const u = await pg.query<{ id: string }>(`SELECT id FROM "User" ORDER BY id LIMIT 1`)
    await pg.query(`UPDATE "User" SET name = name || '!' WHERE id = $1`, [u.rows[0].id])
    // reaction is a leaf (no FK points at it), so exactly one row disappears (no cascade).
    await pg.query(`DELETE FROM reaction WHERE id = (SELECT id FROM reaction ORDER BY id LIMIT 1)`)
    // ...and one row that exists only in the target (exercises the extra-key pass).
    await pg.query(
      `INSERT INTO reaction SELECT * FROM jsonb_populate_record(NULL::reaction, (SELECT to_jsonb(r) || '{"id":"zz-extra-row","emoji":"zz"}'::jsonb FROM reaction r ORDER BY id DESC LIMIT 1))`,
    )
    const r = await run("verify-only")
    expect(r).toMatchObject({ outcome: "verify-failed", exitCode: 1 })
    expect(r.verification?.mismatched.sort()).toEqual(["User", "reaction"])
    const user = r.verification!.tables.find((t) => t.table === "User")!
    expect(user.sourceRows).toBe(user.targetRows)
    expect(user.differences).toEqual([{ kind: "content-differs", key: u.rows[0].id }])
    const reaction = r.verification!.tables.find((t) => t.table === "reaction")!
    expect(reaction.targetRows).toBe(reaction.sourceRows)
    expect(reaction.differences.map((d) => d.kind).sort()).toEqual(["extra-in-target", "missing-in-target"])
    expect(reaction.differences.find((d) => d.kind === "extra-in-target")?.key).toBe("zz-extra-row")
  }, 120_000)

  it("refuses a non-empty target and changes nothing", async () => {
    const before = await totalTargetRows()
    expect(before).toBeGreaterThan(0)
    const r = await run("migrate")
    expect(r).toMatchObject({ outcome: "precheck-failed", exitCode: 2 })
    expect(r.precheck.errors.map((e) => e.code)).toEqual(["TARGET_NOT_EMPTY"])
    expect(await totalTargetRows()).toBe(before)
  }, 120_000)

  it("a mismatch found inside the transaction rolls everything back (nothing committed)", async () => {
    await emptyTarget()
    const r = await run("migrate", {}, {
      afterCopy: async (target) => {
        await target.query(`/* k2:test-corrupt:User */ UPDATE "User" SET name = name || '?' WHERE id = (SELECT min(id) FROM "User")`)
      },
    })
    expect(r).toMatchObject({ outcome: "verify-failed", exitCode: 1, committed: false })
    expect(r.verification?.mismatched).toEqual(["User"])
    expect(await totalTargetRows()).toBe(0)
  }, 120_000)

  it("an interruption mid-copy rolls everything back; the re-run completes and verifies", async () => {
    await emptyTarget()
    let copied = 0
    const r1 = await run("migrate", {}, {
      onTableCopied: () => {
        if (++copied === 20) throw new Error("simulated interruption after 20 tables")
      },
    })
    expect(r1).toMatchObject({ outcome: "error", exitCode: 3, committed: false })
    expect(await totalTargetRows()).toBe(0)
    const r2 = await run("migrate")
    expect(r2).toMatchObject({ outcome: "ok", committed: true })
  }, 180_000)

  it("a killed migrator process leaves an empty target and the re-run completes", async () => {
    await emptyTarget()
    const script = path.join(APP_DIR, "scripts", "migrate-mysql-to-pg.ts")
    const child = spawn(
      process.execPath,
      [
        "--import", "tsx", script,
        "--source", `mysql://k2_reader@127.0.0.1:${MY_PORT}/${MY_DB}`,
        "--target", `postgresql://k2_pg@127.0.0.1:${PG_PORT}/${PG_DB}`,
        "--expect-target", `127.0.0.1:${PG_PORT}/${PG_DB}`,
        "--source-identity", identities.source, "--target-identity", identities.target,
        "--accept-warnings", SEEDED_WARNINGS.join(","), "--dry-run-report", dryRunReportFile,
        "--batch-size", "1",
      ],
      {
        cwd: APP_DIR,
        env: { ...process.env, KANFLOW_MIGRATOR_SOURCE_PASSWORD: SECRETS.mysqlReader, KANFLOW_MIGRATOR_TARGET_PASSWORD: SECRETS.pg, KANFLOW_MIGRATOR_DENY_TARGETS: "127.0.0.1:25434/*" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    let output = ""
    const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()))
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no copy progress seen:\n${output}`)), 90_000)
      child.stdout.on("data", (d: Buffer) => {
        output += d.toString()
        if (output.split("[copy]").length > 8) {
          clearTimeout(timer)
          child.kill("SIGKILL")
          resolve()
        }
      })
    })
    await exited
    expect(output).not.toContain("COMMITTED")
    for (let i = 0; i < 50; i++) {
      const a = await pg.query<{ n: string }>(`SELECT COUNT(*) AS n FROM pg_stat_activity WHERE application_name = 'kanflow-k2-migrator'`)
      if (Number(a.rows[0].n) === 0) break
      await new Promise((res) => setTimeout(res, 200))
    }
    expect(await totalTargetRows()).toBe(0)
    const r = await run("migrate")
    expect(r).toMatchObject({ outcome: "ok", committed: true })
  }, 240_000)

  it("citext duplicates abort with the keys - and no seeded e-mail appears in any output", async () => {
    await emptyTarget()
    const { keys, undo } = await injectDefect(seedConn, "case-dup")
    const lines: string[] = []
    try {
      const r = await run("migrate", {}, { log: (l) => lines.push(l) })
      expect(r.outcome).toBe("precheck-failed")
      const dup = r.precheck.errors.find((e) => e.code === "CITEXT_DUPLICATE")
      expect(dup?.table).toBe("User")
      expect(dup?.sampleKeys.join(" ")).toContain(keys[0])
      expect(dup?.sampleKeys.join(" ")).toContain(keys[1])
      expect(dup?.sampleKeys[0]).toMatch(/^value#[0-9a-f]{16} <- /)
      const [now] = await seedConn.query<RowDataPacket[]>("SELECT email FROM `user`")
      const output = lines.join("\n") + JSON.stringify(r)
      for (const e of [...seededEmails, ...now.map((x) => String(x.email))]) expect(output).not.toContain(e)
      expect(output.toLowerCase()).not.toContain("lice.k2@example.test")
      expect(await totalTargetRows()).toBe(0)
    } finally {
      await undo()
    }
  }, 120_000)

  it("a NUL byte in text aborts with the row key", async () => {
    const { keys, undo } = await injectDefect(seedConn, "nul")
    try {
      const r = await run("dry-run")
      const nul = r.precheck.errors.filter((e) => e.code === "NUL_BYTE")
      expect(nul).toHaveLength(1)
      expect(nul[0]).toMatchObject({ table: "Project", column: "description", count: 1, sampleKeys: [keys[0]] })
    } finally {
      await undo()
    }
  }, 120_000)

  it("JSON jsonb cannot hold aborts by default; --allow-invalid-json nulls it, hands the original to the side file and verifies", async () => {
    await emptyTarget()
    const { keys, undo } = await injectDefect(seedConn, "invalid-json")
    try {
      const refused = await run("migrate")
      expect(refused.precheck.errors.map((e) => e.code)).toEqual(["INVALID_JSON"])
      expect(refused.precheck.errors[0].sampleKeys).toEqual([keys[0]])
      const side: InvalidJsonRecord[] = []
      const r = await run("migrate", { allowInvalidJson: true }, { onInvalidJsonNulled: (x) => void side.push(...x) })
      expect(r).toMatchObject({ outcome: "ok", committed: true })
      expect(r.copy?.invalidJsonNulled).toBe(1)
      expect(side).toEqual([{ table: "git_link", column: "outsideScopePaths", key: keys[0], original: expect.stringContaining("nul") }])
      expect(JSON.stringify(r)).not.toMatch(/nul.{0,12}inside/)
      const v = await pg.query(`SELECT "outsideScopePaths" FROM git_link WHERE id = $1`, [keys[0]])
      expect(v.rows[0].outsideScopePaths).toBeNull()
    } finally {
      await undo()
    }
  }, 180_000)

  it("the CLI refuses a deny-listed target before connecting", async () => {
    const runSpy = vi.fn(runWithConnections)
    const out: string[] = []
    const code = await cliMain(
      ["--source", `mysql://k2_reader@127.0.0.1:${MY_PORT}/${MY_DB}`, "--target", `postgresql://k2_pg@localhost:${PG_PORT}/${PG_DB}`, "--expect-target", `localhost:${PG_PORT}/${PG_DB}`, "--dry-run"],
      {
        env: { KANFLOW_MIGRATOR_SOURCE_PASSWORD: "x", KANFLOW_MIGRATOR_TARGET_PASSWORD: "y", KANFLOW_MIGRATOR_DENY_TARGETS: `127.0.0.1:${PG_PORT}/${PG_DB}` },
        platform: process.platform,
        readFile: () => "",
        statMode: () => 0o100600,
        writeReport: () => {},
        print: (l) => out.push(l),
        run: runSpy,
      },
    )
    expect(code).toBe(2)
    expect(runSpy).not.toHaveBeenCalled()
    expect(out.join("\n")).toContain("TARGET_DENIED")
  })
})
