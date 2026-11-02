/**
 * MySQL 8.4 -> PostgreSQL 16 data migration for the Kanflow production cutover (MR K2).
 *
 *   node --import tsx scripts/migrate-mysql-to-pg.ts \
 *     --source mysql://kanflow_migrator@127.0.0.1:3306/scrum_tool \
 *     --target postgresql://kanflow@<pg-host>:5432/scrum_tool \
 *     --expect-target <pg-host>:5432/scrum_tool [--dry-run | --verify-only]  *     [--source-identity <id> --target-identity <id>] [--accept-warnings CODE,...]  *     [--report logs/k2-<ts>.json] [--deny-file <file>] [--target-ca <ca.pem>] ...
 *
 * Copies DATA ONLY into a schema created by `npx prisma migrate deploy`
 * (prisma/migrations, 0_init onwards), table by table in foreign-key order,
 * inside one PostgreSQL transaction, then verifies row counts and ordered
 * content hashes table by table. `node --import tsx scripts/migrate-mysql-to-pg.ts --help`.
 *
 * Never reads DATABASE_URL or .env. Passwords: KANFLOW_MIGRATOR_SOURCE_PASSWORD /
 * KANFLOW_MIGRATOR_TARGET_PASSWORD or --source-password-file / --target-password-file.
 * Deny list (required): KANFLOW_MIGRATOR_DENY_TARGETS and/or --deny-file.
 *
 * Procedure and approvals: docs/operations/mysql-to-pg-cutover.md
 * Rehearsal record:        docs/operations/mysql-to-pg-rehearsal.md
 * Library + tests:         src/lib/db-migrator/
 */
import fs from "node:fs"
import path from "node:path"
import { cliMain } from "../src/lib/db-migrator/cli"
import { runWithConnections } from "../src/lib/db-migrator/connect"
import { checkWindowsAcl } from "../src/lib/db-migrator/file-acl"

/** temp file in the same directory + rename: a reader never sees a half-written file. Owner-only mode. */
function writeAtomic(file: string, content: string): void {
  const abs = path.resolve(file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.tmp`
  fs.writeFileSync(tmp, content, { encoding: "utf8", mode: 0o600, flag: "wx" })
  fs.renameSync(tmp, abs)
}

cliMain(process.argv.slice(2), {
  env: process.env,
  platform: process.platform,
  readFile: (f) => fs.readFileSync(f, "utf8"),
  statMode: (f) => fs.statSync(f).mode,
  aclCheck: checkWindowsAcl,
  writeReport: (f, report) => writeAtomic(f, `${JSON.stringify(report, null, 2)}\n`),
  writeSideFile: (f, content) => writeAtomic(f, content),
  print: (line) => process.stdout.write(`${new Date().toISOString()} ${line}\n`),
  run: (args, passwords, log, hooks) => runWithConnections(args, passwords, log, hooks),
})
  .then((code) => {
    process.exitCode = code
  })
  .catch((e: unknown) => {
    process.stderr.write(`fatal: ${e instanceof Error ? e.name : "error"} (details withheld: may contain values)\n`)
    process.exitCode = 3
  })
