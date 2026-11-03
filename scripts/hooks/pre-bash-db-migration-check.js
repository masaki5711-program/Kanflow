#!/usr/bin/env node
/**
 * PreToolUse Hook: DB Migration Integrity Gate
 *
 * Statically scans the database migration / SQL changes that are about to be
 * committed or pushed, and detects changes that risk corrupting or losing
 * existing data, or causing downtime through table locking.
 *
 * Tiered behavior:
 *   - CRITICAL risk -> block the commit/push (exit 2, report fed back to Claude)
 *   - WARNING risk  -> allow, but surface a report (exit 0 + stderr)
 *   - no migration changes / SAFE -> pass through silently
 *
 * Static analysis only: no database connection required, runs in any clone.
 * Fails open — any internal error passes the command through unblocked.
 *
 * Beyond raw SQL, ORM schema sources (Prisma / Drizzle / SQLAlchemy) are
 * scanned for frozen Tier-2 (t2_ / m2_) declarations, and a changeset-level
 * rule warns when Tier-1 DDL ships without its me_edge_primary_data_* catalog
 * sync (iotpf-pfs-data-model.md R3).
 *
 * Pairs with the `db-data-integrity-validator` skill (report format / risk
 * categories). Compatible with bash-hook-dispatcher.js via module.exports.run().
 *
 * Cross-platform (Windows, macOS, Linux).
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');

const MAX_STDIN = 1024 * 1024;

// --- Risk rules: line-level static patterns ------------------------------
// Each added line of a migration/SQL change is matched (uppercased) here.
const RISK_RULES = [
  {
    level: 'CRITICAL', category: 'Destructive', label: 'DROP TABLE',
    test: u => /\bDROP\s+TABLE\b/.test(u),
    effect: 'the table and every row in it are permanently lost',
    fix: 'confirm the table is truly unused; back up first, then drop in a separate reversible migration',
  },
  {
    level: 'CRITICAL', category: 'Destructive', label: 'DROP COLUMN',
    test: u => /\bDROP\s+COLUMN\b/.test(u),
    effect: 'every value stored in that column is permanently lost',
    fix: 'deploy code that no longer reads the column first; drop it in a later migration after a backup',
  },
  {
    level: 'CRITICAL', category: 'Destructive', label: 'TRUNCATE',
    test: u => /\bTRUNCATE\b/.test(u),
    effect: 'all rows in the table are deleted immediately',
    fix: 'avoid TRUNCATE in migrations; if intentional, back up the data first',
  },
  {
    level: 'CRITICAL', category: 'Destructive', label: 'DELETE without WHERE',
    test: u => /\bDELETE\s+FROM\b/.test(u) && !/\bWHERE\b/.test(u),
    effect: 'every row in the table is deleted',
    fix: 'add a WHERE clause, or back up the data if a full delete is intended',
  },
  {
    level: 'CRITICAL', category: 'Destructive', label: 'ADD COLUMN NOT NULL without DEFAULT',
    test: u => /\bADD\s+COLUMN\b/.test(u) && /\bNOT\s+NULL\b/.test(u) && !/\bDEFAULT\b/.test(u),
    effect: 'the migration fails on any table that already contains rows',
    fix: 'add the column with a DEFAULT (or nullable), backfill, then enforce NOT NULL separately',
  },
  {
    level: 'CRITICAL', category: 'Tier-2 freeze', label: 'DDL on frozen Tier-2 table (t2_*/m2_*)',
    test: u => /\b(?:CREATE|ALTER|DROP)\s+TABLE\b[^;]*\b(?:T2_|M2_)/.test(u),
    effect: 'Tier-2 (standardized) table definitions are frozen while the system is running — CLAUDE.md §3 (freeze scope t2_*/m2_*, iotpf-pfs-data-model.md)',
    fix: 'put the new data need into a Tier-1 optional column or the ETL 1→2 layer, never into a Tier-2 definition; a truly unavoidable Tier-2 change needs a planned system stop and team sign-off (run the tier2-schema-freeze-enforcer agent)',
  },
  {
    level: 'CRITICAL', category: 'Tier-2 freeze', label: 'DROP SCHEMA pfs',
    test: u => /\bDROP\s+SCHEMA\b[^;]*\bPFS\b/.test(u),
    effect: 'destroys the entire standardized (Tier-2) data model in schema pfs',
    fix: 'never drop the pfs schema in a migration; Tier-2 definitions are frozen (CLAUDE.md §3)',
  },
  {
    level: 'WARNING', category: 'Performance/Lock', label: 'ALTER COLUMN ... TYPE',
    test: u => /\bALTER\s+COLUMN\b/.test(u) && /\bTYPE\b/.test(u),
    effect: 'a type change can rewrite the whole table and truncate/overflow existing values',
    fix: 'add a new column, backfill the converted data, then drop the old column',
  },
  {
    level: 'WARNING', category: 'Data inconsistency', label: 'SET NOT NULL',
    test: u => /\bSET\s+NOT\s+NULL\b/.test(u),
    effect: 'fails if the column already contains NULL rows',
    fix: 'backfill all NULL values first, then add the NOT NULL constraint',
  },
  {
    level: 'WARNING', category: 'Data inconsistency', label: 'ADD UNIQUE constraint',
    test: u => /\bADD\b/.test(u) && /\bUNIQUE\b/.test(u),
    effect: 'fails if the column already contains duplicate values',
    fix: 'de-duplicate existing rows first; on PostgreSQL build the unique index CONCURRENTLY',
  },
  {
    level: 'WARNING', category: 'Data inconsistency', label: 'ADD FOREIGN KEY',
    test: u => /\bADD\b/.test(u) && /\bFOREIGN\s+KEY\b/.test(u),
    effect: 'fails on orphaned rows and locks both tables while validating',
    fix: 'clean up orphan rows; on PostgreSQL add the constraint NOT VALID, then VALIDATE separately',
  },
  {
    level: 'WARNING', category: 'Performance/Lock', label: 'CREATE INDEX without CONCURRENTLY',
    test: u => /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/.test(u) && !/\bCONCURRENTLY\b/.test(u),
    effect: 'a full table lock for the duration of the build — downtime grows with table size',
    fix: 'on PostgreSQL use CREATE INDEX CONCURRENTLY (outside a transaction)',
  },
  {
    level: 'WARNING', category: 'Destructive', label: 'UPDATE without WHERE',
    test: u => /\bUPDATE\s+\S+\s+SET\b/.test(u) && !/\bWHERE\b/.test(u),
    effect: 'every row in the table is rewritten',
    fix: 'add a WHERE clause to scope the update (or confirm a full-table update is intended)',
  },
];

// --- ORM schema rules ------------------------------------------------------
// The SQL rules above only see raw SQL. A Tier-2 change declared through an
// ORM schema (Prisma model / @@map, Drizzle pgTable, SQLAlchemy __tablename__)
// would otherwise pass the gate and rely on an advisory agent being invoked.
const ORM_RISK_RULES = [
  {
    level: 'CRITICAL', category: 'Tier-2 freeze', label: 'ORM-declared change to frozen Tier-2 table (t2_*/m2_*)',
    test: u => /(?:\bMODEL\s+|@@MAP\(\s*["']|PGTABLE\(\s*["']|__TABLENAME__\s*=\s*["'])(?:T2_|M2_)/.test(u),
    effect: 'Tier-2 (standardized) table definitions are frozen while the system is running — CLAUDE.md §3; declaring the change via an ORM does not exempt it',
    fix: 'point the ORM model at a Tier-1 optional column or handle the need in ETL 1→2; a truly unavoidable Tier-2 change needs a planned system stop and team sign-off (run the tier2-schema-freeze-enforcer agent)',
  },
];

// --- Git helpers ---------------------------------------------------------

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

function isMigrationFile(filePath) {
  const p = String(filePath).replace(/\\/g, '/').toLowerCase();
  // Foundation-DDL reference artifacts under apps/schemas/sql/ are committed
  // contracts (iotpf-pfs-data-model.md mandates landing them there), not
  // migrations run against a live database — the freeze/lock rules this gate
  // enforces do not apply to landing the definition document itself. Their
  // migrations/ subdirectories DO count as migrations and stay in scope.
  if (/(^|\/)apps\/schemas\/sql\//.test(p) && !/(^|\/)migrations?(\/|$)/.test(p)) {
    return false;
  }
  // Same class of artifact under docs/ (e.g. the SQL-iotdb Rev1.15 design
  // documents in docs/Doc_IoTplatform*/): documentation is never a migration
  // run against a live database. A migrations/ subdirectory still counts.
  if (/(^|\/)docs\//.test(p) && !/(^|\/)migrations?(\/|$)/.test(p)) {
    return false;
  }
  if (p.endsWith('.sql')) return true;
  return /(^|\/)(migrations?|drizzle)(\/|$)/.test(p);
}

const TEST_PATH_RE = /(^|\/)(__tests__|tests?|fixtures?)(\/|$)|\.(test|spec)\.[a-z]+$/i;

/** ORM schema sources: scanned with ORM_RISK_RULES only (not the SQL rules). */
function isOrmSchemaFile(filePath) {
  const p = String(filePath).replace(/\\/g, '/').toLowerCase();
  if (TEST_PATH_RE.test(p)) return false; // fixtures may contain literal t2_ examples
  if (p.endsWith('.prisma')) return true;
  return /\.(ts|mts|cts|js|mjs|cjs|py)$/.test(p);
}

/** Which rule set (if any) applies to a changed file. */
function fileKind(filePath) {
  if (isMigrationFile(filePath)) return 'migration';
  if (isOrmSchemaFile(filePath)) return 'orm';
  return null;
}

/**
 * Parse a `git diff -U0` text and return added lines that belong to
 * migration/SQL files, with their new-file line numbers.
 */
function addedLinesFromDiff(diffText) {
  const out = [];
  if (!diffText) return out;
  let file = null;
  let kind = null;
  let lineNo = 0;
  for (const row of diffText.split('\n')) {
    if (row.startsWith('+++ ')) {
      const m = row.match(/^\+\+\+ b\/(.+)$/);
      file = m ? m[1] : null;
      kind = file ? fileKind(file) : null;
    } else if (row.startsWith('@@')) {
      const m = row.match(/\+(\d+)/);
      lineNo = m ? parseInt(m[1], 10) : 0;
    } else if (!kind) {
      continue;
    } else if (row.startsWith('+')) {
      out.push({ file, line: lineNo, text: row.slice(1), kind });
      lineNo += 1;
    } else if (!row.startsWith('-')) {
      lineNo += 1; // context line advances the new-file counter; removals do not
    }
  }
  return out;
}

/** Untracked (not-yet-staged) migration files — whole content counts as added. */
function untrackedMigrationLines() {
  const out = [];
  const listed = git(['ls-files', '--others', '--exclude-standard']);
  if (!listed) return out;
  for (const f of listed.split('\n').map(s => s.trim()).filter(Boolean)) {
    const kind = fileKind(f);
    if (!kind) continue;
    try {
      fs.readFileSync(f, 'utf8').split('\n').forEach((text, i) => {
        out.push({ file: f, line: i + 1, text, kind });
      });
    } catch { /* unreadable — skip */ }
  }
  return out;
}

function collectChangedLines(mode, command) {
  const lines = [];
  if (mode === 'commit') {
    lines.push(...addedLinesFromDiff(git(['diff', '--cached', '-U0', '--diff-filter=ACMR'])));
    const stagesNew = /\bgit\s+(?:add|stage)\b/.test(command);
    const commitAll = /\bcommit\b[\s\S]*?\s-{1,2}a(?:m|ll)?\b/.test(command);
    if (stagesNew || commitAll) {
      lines.push(...addedLinesFromDiff(git(['diff', '-U0', '--diff-filter=ACMR'])));
    }
    if (stagesNew) {
      lines.push(...untrackedMigrationLines());
    }
  } else {
    const upstream = (git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) || '').trim();
    const range = upstream && !upstream.startsWith('@') ? `${upstream}..HEAD` : 'HEAD~1..HEAD';
    lines.push(...addedLinesFromDiff(git(['diff', '-U0', '--diff-filter=ACMR', range])));
  }
  return lines;
}

// --- Scan + report -------------------------------------------------------

function scan(lines) {
  const issues = [];
  const seen = new Set();
  for (const { file, line, text, kind } of lines) {
    const trimmed = text.trim();
    if (trimmed.startsWith('--') || trimmed.startsWith('#')) continue; // SQL comment
    const upper = trimmed.toUpperCase();
    const rules = kind === 'orm' ? ORM_RISK_RULES : RISK_RULES;
    for (const rule of rules) {
      if (!rule.test(upper)) continue;
      const key = `${file}|${line}|${rule.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ ...rule, file, line, snippet: trimmed.slice(0, 120) });
    }
  }
  issues.push(...catalogSyncIssues(lines));
  return issues;
}

// Changeset-level rule (iotpf-pfs-data-model.md R3): Tier-1 DDL must ship its
// central-catalog sync (pfs.me_edge_primary_data_*) in the same changeset —
// otherwise Flow B tool discovery / ETL mapping drift silently.
function catalogSyncIssues(lines) {
  let firstT1 = null;
  let hasCatalogSync = false;
  for (const { file, line, text, kind } of lines) {
    const trimmed = text.trim();
    if (trimmed.startsWith('--') || trimmed.startsWith('#')) continue;
    const upper = trimmed.toUpperCase();
    if (upper.includes('ME_EDGE_PRIMARY_DATA')) hasCatalogSync = true;
    if (!firstT1 && kind === 'migration' && /\b(?:CREATE|ALTER)\s+TABLE\b[^;]*\bT1_/.test(upper)) {
      firstT1 = { file, line, snippet: trimmed.slice(0, 120) };
    }
  }
  if (!firstT1 || hasCatalogSync) return [];
  return [{
    level: 'WARNING', category: 'Catalog sync', label: 'Tier-1 DDL without central-catalog sync',
    ...firstT1,
    effect: 'the PFS central Tier-1 catalog (pfs.me_edge_primary_data_*) drifts from the PFE schema, silently breaking Flow B tool discovery and ETL mapping (iotpf-pfs-data-model.md R3)',
    fix: 'ship the me_edge_primary_data_* catalog sync (insert/update) in the same changeset as the Tier-1 DDL, or state in the MR why the sync is deferred',
  }];
}

function buildReport(issues, verdict) {
  const critical = issues.filter(i => i.level === 'CRITICAL');
  const warnings = issues.filter(i => i.level === 'WARNING');
  const lines = [];
  lines.push(`[DB Integrity Gate] ${verdict === 'CRITICAL' ? 'BLOCKED' : 'WARNING'} — database migration risk detected`);
  lines.push('');
  lines.push(verdict === 'CRITICAL'
    ? `### 1. Risk Assessment: CRITICAL — ${critical.length} change(s) can corrupt or permanently lose existing data.`
    : `### 1. Risk Assessment: WARNING — ${warnings.length} change(s) may fail or cause downtime depending on data state or table size.`);
  lines.push('');
  lines.push('### 2. Detected Issues');
  for (const i of issues) {
    lines.push(`- **[${i.level} / ${i.category}]** ${i.file}:${i.line} — ${i.label}: ${i.effect}.`);
    lines.push(`    > ${i.snippet}`);
  }
  lines.push('');
  lines.push('### 3. Mitigation Strategy');
  const seenFix = new Set();
  for (const i of issues) {
    if (seenFix.has(i.label)) continue;
    seenFix.add(i.label);
    lines.push(`- ${i.label}: ${i.fix}.`);
  }
  lines.push('');
  if (verdict === 'CRITICAL') {
    lines.push('Fix the migration — typically split it into a safe multi-step migration (add → backfill → drop) — then retry.');
    lines.push('Use the `db-data-integrity-validator` skill for a full assessment and rollback plan.');
    lines.push('If the change is reviewed and intentional, disable this gate via ECC_DISABLED_HOOKS=pre:bash:db-migration-check.');
  } else {
    lines.push('Commit/push is allowed. Review the mitigations above before the migration is deployed.');
  }
  return lines.join('\n');
}

// --- Hook entry point ----------------------------------------------------

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const command = String(input.tool_input?.command || '');
    if (!command) return rawInput;

    const isCommit = /\bgit\s+(?:[^\n|;&]*\s)?commit\b/.test(command);
    const isPush = !isCommit && /\bgit\s+(?:[^\n|;&]*\s)?push\b/.test(command);
    if (!isCommit && !isPush) return rawInput;

    const lines = collectChangedLines(isCommit ? 'commit' : 'push', command);
    if (lines.length === 0) return rawInput;

    const issues = scan(lines);
    if (issues.length === 0) return rawInput;

    if (issues.some(i => i.level === 'CRITICAL')) {
      return { exitCode: 2, stderr: buildReport(issues, 'CRITICAL') };
    }
    return {
      stdout: typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput),
      stderr: buildReport(issues, 'WARNING'),
      exitCode: 0,
    };
  } catch {
    // Fail open: never block a command because of a hook error.
  }
  return rawInput;
}

module.exports = { run };

// stdin entry point for direct / spawned execution
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      raw += chunk.substring(0, MAX_STDIN - raw.length);
    }
  });
  process.stdin.on('end', () => {
    const result = run(raw);
    if (result && typeof result === 'object') {
      if (result.stderr) process.stderr.write(`${result.stderr}\n`);
      process.stdout.write(String(result.stdout || ''));
      process.exit(Number.isInteger(result.exitCode) ? result.exitCode : 0);
    } else {
      process.stdout.write(String(result));
      process.exit(0);
    }
  });
}
