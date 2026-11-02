import { execFileSync, spawn } from "node:child_process"
import path from "node:path"
import type { Connection } from "mysql2/promise"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { parseEndpoint } from "../args"
import { cliMain } from "../cli"
import { runWithConnections } from "../connect"
import { openMysqlSource } from "../mysql-port"
import { openPgTarget } from "../pg-port"
import { runMigrator, type MigrationReport, type RunHooks, type RunOptions } from "../run"
import { applyMysqlSchema, dropAllTables, injectDefect, openSeedConnection, seedSynthetic } from "../../../../scripts/seed-mysql-synthetic"

/**
 * End to end against the two SYNTHETIC rehearsal containers of
 * ops/test-env/migrator-compose.yml (never production, never another agent's DB):
 *
 *   docker compose -p kanflow-k2-test -f ops/test-env/migrator-compose.yml up -d --wait
 *   KANFLOW_MIGRATOR_TESTS=1 npx vitest run src/lib/db-migrator/__tests__/migrator.integration.test.ts
 *
 * Uses its own databases: MySQL `scrum_tool_it` (frozen MySQL migrations + seed)
 * and PostgreSQL `scrum_tool_it` (re-created, `prisma migrate deploy`).
 * Endpoints can be moved with K2_IT_MYSQL_PORT / K2_IT_PG_PORT (loopback only).
 */
const enabled = process.env.KANFLOW_MIGRATOR_TESTS === "1"
const MY_PORT = Number(process.env.K2_IT_MYSQL_PORT ?? 23306)
const PG_PORT = Number(process.env.K2_IT_PG_PORT ?? 25435)
const DB = "scrum_tool_it"
const APP_DIR = path.resolve(__dirname, "..", "..", "..", "..")
const SECRETS = { mysqlApp: "k2_app_synthetic", mysqlReader: "k2_reader_synthetic", pg: "k2_pg_synthetic" }

const sourceEp = parseEndpoint(`mysql://k2_reader@127.0.0.1:${MY_PORT}/${DB}`, "mysql", "--source")
const seedEp = parseEndpoint(`mysql://k2_app@127.0.0.1:${MY_PORT}/${DB}`, "mysql", "--source")
const targetEp = parseEndpoint(`postgresql://k2_pg@127.0.0.1:${PG_PORT}/${DB}`, "postgresql", "--target")
const TIMEOUT_MS = 60_000

async function pgClient(database: string): Promise<Client> {
  const c = new Client({ host: "127.0.0.1", port: PG_PORT, user: "k2_pg", password: SECRETS.pg, database, connectionTimeoutMillis: 10_000 })
  await c.connect()
  return c
}

async function run(mode: RunOptions["mode"], extra: Partial<RunOptions> = {}, hooks: RunHooks = {}): Promise<MigrationReport> {
  const source = await openMysqlSource(sourceEp, SECRETS.mysqlReader, TIMEOUT_MS)
  const target = await openPgTarget(targetEp, SECRETS.pg, { readOnly: mode !== "migrate", statementTimeoutMs: TIMEOUT_MS })
  try {
    return await runMigrator({ mode, batchSize: 50, allowInvalidJson: false, ...extra }, { source, target }, hooks)
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

  const totalTargetRows = async (): Promise<number> => {
    const r = await pg.query<{ n: string }>(appTables.map((t) => `SELECT COUNT(*) AS n FROM "${t}"`).join(" UNION ALL "))
    return r.rows.reduce((a, x) => a + Number(x.n), 0)
  }
  const emptyTarget = async (): Promise<void> => {
    await pg.query(`TRUNCATE ${appTables.map((t) => `"${t}"`).join(", ")}`)
  }

  beforeAll(async () => {
    // PostgreSQL: fresh database with the platform locale, schema from prisma migrate deploy.
    const admin = await pgClient("scrum_tool")
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${DB} TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'und' LOCALE 'C.UTF-8'`)
    await admin.end()
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], {
      cwd: APP_DIR,
      env: { ...process.env, DATABASE_URL: `postgresql://k2_pg:${SECRETS.pg}@127.0.0.1:${PG_PORT}/${DB}` },
      stdio: "pipe",
      shell: process.platform === "win32",
      timeout: 180_000,
    })
    pg = await pgClient(DB)
    const t = await pg.query<{ t: string }>(
      "SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1",
    )
    appTables = t.rows.map((r) => r.t)

    // MySQL: the frozen production schema (re-applied when missing) + synthetic rows.
    seedConn = await openSeedConnection(seedEp, SECRETS.mysqlApp)
    const [rows] = await seedConn.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")
    if (Number((rows as { n: number }[])[0].n) !== appTables.length) {
      await dropAllTables(seedConn)
      await applyMysqlSchema(seedConn, path.join(APP_DIR, "prisma", "migrations-mysql"))
    } else {
      await seedConn.query("SET FOREIGN_KEY_CHECKS = 0")
      const [names] = await seedConn.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")
      for (const r of names as { t: string }[]) await seedConn.query(`DELETE FROM \`${r.t}\``)
      await seedConn.query("SET FOREIGN_KEY_CHECKS = 1")
    }
    seeded = (await seedSynthetic(seedConn, { rowsPerTable: 5, seed: 7 })).rows
  }, 600_000)

  afterAll(async () => {
    await seedConn?.end()
    await pg?.end()
  })

  it("--dry-run passes the pre-checks on clean synthetic data and leaves the target empty", async () => {
    const r = await run("dry-run")
    expect(r.precheck.errors).toEqual([])
    expect(r.outcome).toBe("ok")
    expect(Object.values(r.sourceCounts).reduce((a, b) => a + b, 0)).toBe(seeded)
    expect(await totalTargetRows()).toBe(0)
  }, 120_000)

  it("copies everything and verification matches counts and hashes for every table", async () => {
    const r = await run("migrate")
    expect(r.error).toBeUndefined()
    expect(r.outcome).toBe("ok")
    expect(r.exitCode).toBe(0)
    expect(r.verification?.tables).toHaveLength(appTables.length)
    expect(r.verification?.mismatched).toEqual([])
    expect(r.copy?.tables.reduce((a, t) => a + t.rows, 0)).toBe(seeded)
    expect(r.copy?.deferredUpdates).toBeGreaterThan(0)
    expect(await totalTargetRows()).toBe(seeded)
    // Legacy local-time rows are reported, not shifted.
    const local = r.precheck.warnings.find((w) => w.code === "LOCAL_TIME_SUSPECT")
    expect(local?.count).toBe(3)
    expect(r.precheck.warnings.find((w) => w.code === "FUTURE_TIMESTAMP")?.count).toBe(1)
    const shifted = await pg.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM field_translation WHERE requested_at > translated_at + interval '6 hours'`,
    )
    expect(Number(shifted.rows[0].n)).toBe(3)
  }, 120_000)

  it("a corrupted target row (and a missing one) makes verification fail and names the keys", async () => {
    const u = await pg.query<{ id: string }>(`SELECT id FROM "User" ORDER BY id LIMIT 1`)
    await pg.query(`UPDATE "User" SET name = name || '!' WHERE id = $1`, [u.rows[0].id])
    // reaction is a leaf (no FK points at it), so exactly one row disappears (no cascade).
    await pg.query(`DELETE FROM reaction WHERE id = (SELECT id FROM reaction ORDER BY id LIMIT 1)`)
    const r = await run("verify-only")
    expect(r.outcome).toBe("verify-failed")
    expect(r.exitCode).toBe(1)
    expect(r.verification?.mismatched.sort()).toEqual(["User", "reaction"])
    const user = r.verification!.tables.find((t) => t.table === "User")!
    expect(user.sourceRows).toBe(user.targetRows)
    expect(user.sourceHash).not.toBe(user.targetHash)
    expect(user.differences).toEqual([{ kind: "content-differs", key: u.rows[0].id }])
    const reaction = r.verification!.tables.find((t) => t.table === "reaction")!
    expect(reaction.targetRows).toBe(reaction.sourceRows - 1)
    expect(reaction.differences.map((d) => d.kind)).toEqual(["missing-in-target"])
  }, 120_000)

  it("refuses a non-empty target and changes nothing", async () => {
    const before = await totalTargetRows()
    expect(before).toBeGreaterThan(0)
    const r = await run("migrate")
    expect(r.outcome).toBe("precheck-failed")
    expect(r.exitCode).toBe(2)
    expect(r.precheck.errors.map((e) => e.code)).toEqual(["TARGET_NOT_EMPTY"])
    expect(await totalTargetRows()).toBe(before)
  }, 120_000)

  it("an interruption mid-copy rolls everything back; the re-run completes and verifies", async () => {
    await emptyTarget()
    let copied = 0
    const r1 = await run("migrate", {}, {
      onTableCopied: () => {
        if (++copied === 20) throw new Error("simulated interruption after 20 tables")
      },
    })
    expect(r1.outcome).toBe("error")
    expect(r1.exitCode).toBe(3)
    expect(await totalTargetRows()).toBe(0)
    const r2 = await run("migrate")
    expect(r2.outcome).toBe("ok")
    expect(r2.verification?.mismatched).toEqual([])
  }, 180_000)

  it("a killed migrator process leaves an empty target and the re-run completes", async () => {
    await emptyTarget()
    const script = path.join(APP_DIR, "scripts", "migrate-mysql-to-pg.ts")
    const child = spawn(
      process.execPath,
      ["--import", "tsx", script, "--source", `mysql://k2_reader@127.0.0.1:${MY_PORT}/${DB}`, "--target", `postgresql://k2_pg@127.0.0.1:${PG_PORT}/${DB}`, "--batch-size", "1"],
      {
        cwd: APP_DIR,
        env: {
          ...process.env,
          KANFLOW_MIGRATOR_SOURCE_PASSWORD: SECRETS.mysqlReader,
          KANFLOW_MIGRATOR_TARGET_PASSWORD: SECRETS.pg,
          KANFLOW_MIGRATOR_DENY_TARGETS: "127.0.0.1:25434/*",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    let output = ""
    const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()))
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no copy progress seen:\n${output}`)), 90_000)
      child.stdout.on("data", (d: Buffer) => {
        output += d.toString()
        if (/\[copy\] .*: (\d+)\/\d+ rows/.test(output) && output.split("[copy]").length > 8) {
          clearTimeout(timer)
          child.kill("SIGKILL")
          resolve()
        }
      })
    })
    await exited
    expect(output).not.toContain("committed")
    // The server notices the dropped connection and aborts the open transaction.
    for (let i = 0; i < 50; i++) {
      const a = await pg.query<{ n: string }>(`SELECT COUNT(*) AS n FROM pg_stat_activity WHERE application_name = 'kanflow-k2-migrator'`)
      if (Number(a.rows[0].n) === 0) break
      await new Promise((res) => setTimeout(res, 200))
    }
    expect(await totalTargetRows()).toBe(0)
    const r = await run("migrate")
    expect(r.outcome).toBe("ok")
    expect(r.verification?.mismatched).toEqual([])
  }, 240_000)

  it("citext duplicates (U+023A / U+2C65 emails, distinct under utf8mb4_unicode_ci) abort with the list", async () => {
    await emptyTarget()
    const { keys, undo } = await injectDefect(seedConn, "case-dup")
    try {
      const r = await run("migrate")
      expect(r.outcome).toBe("precheck-failed")
      const dup = r.precheck.errors.find((e) => e.code === "CITEXT_DUPLICATE")
      expect(dup?.table).toBe("User")
      expect(dup?.sampleKeys.join(" ")).toContain(keys[0])
      expect(dup?.sampleKeys.join(" ")).toContain(keys[1])
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

  it("JSON jsonb cannot hold aborts by default; --allow-invalid-json copies it as NULL and still verifies", async () => {
    await emptyTarget()
    const { keys, undo } = await injectDefect(seedConn, "invalid-json")
    try {
      const refused = await run("migrate")
      expect(refused.precheck.errors.map((e) => e.code)).toEqual(["INVALID_JSON"])
      expect(refused.precheck.errors[0].sampleKeys).toEqual([keys[0]])
      const r = await run("migrate", { allowInvalidJson: true })
      expect(r.outcome).toBe("ok")
      expect(r.precheck.warnings.find((w) => w.code === "INVALID_JSON")?.count).toBe(1)
      const v = await pg.query(`SELECT "outsideScopePaths" FROM git_link WHERE id = $1`, [keys[0]])
      expect(v.rows[0].outsideScopePaths).toBeNull()
    } finally {
      await undo()
    }
  }, 180_000)

  it("the CLI refuses a deny-listed target before connecting", async () => {
    const runSpy = vi.fn(runWithConnections)
    const out: string[] = []
    const code = await cliMain(["--source", `mysql://k2_reader@127.0.0.1:${MY_PORT}/${DB}`, "--target", `postgresql://k2_pg@localhost:${PG_PORT}/${DB}`], {
      env: { KANFLOW_MIGRATOR_SOURCE_PASSWORD: "x", KANFLOW_MIGRATOR_TARGET_PASSWORD: "y", KANFLOW_MIGRATOR_DENY_TARGETS: `127.0.0.1:${PG_PORT}/${DB}` },
      platform: process.platform,
      readFile: () => "",
      statMode: () => 0o100600,
      writeReport: () => {},
      print: (l) => out.push(l),
      run: runSpy,
    })
    expect(code).toBe(2)
    expect(runSpy).not.toHaveBeenCalled()
    expect(out.join("\n")).toContain("TARGET_DENIED")
  })
})
