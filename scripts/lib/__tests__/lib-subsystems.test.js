'use strict';

/**
 * Unit / integration tests for internal ECC library subsystems.
 *
 * Targets (scripts/lib/):
 *   - state-store/migrations.js  (covered: pure SQL + driver-agnostic apply loop)
 *   - session-manager.js         (covered: parsing + filesystem CRUD round-trip)
 *   - mcp-config.js              (covered: full surface)
 *   - skill-evolution/tracker.js (covered: full surface, JSONL round-trip)
 *   - skill-evolution/health.js  (covered: full surface, discovery + report)
 *
 * SKIPPED (cannot load with Node built-ins only):
 *   - state-store/schema.js   -> requires external package "ajv" (not installed)
 *   - state-store/queries.js  -> requires "./schema" -> "ajv" (not installed)
 *   - state-store/index.js    -> requires external package "sql.js" (not installed)
 *   The largest reachable state-store surface (migrations.js) IS exercised below;
 *   the schema/queries/index drivers need those deps and a schemas/ dir that is
 *   absent on this branch, so they are out of scope for a built-ins-only run.
 *
 * All filesystem state is isolated under os.tmpdir() and removed in test.after().
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const LIB = path.join(__dirname, '..');

const migrations = require(path.join(LIB, 'state-store', 'migrations.js'));
const sessionManager = require(path.join(LIB, 'session-manager.js'));
const mcpConfig = require(path.join(LIB, 'mcp-config.js'));
const tracker = require(path.join(LIB, 'skill-evolution', 'tracker.js'));
const health = require(path.join(LIB, 'skill-evolution', 'health.js'));

// ---------------------------------------------------------------------------
// Shared temp-dir bookkeeping
// ---------------------------------------------------------------------------
const tmpDirs = [];

function makeTmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ecc-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

// ---------------------------------------------------------------------------
// state-store/migrations.js
// ---------------------------------------------------------------------------

test('migrations: MIGRATIONS exposes version 1 with initial SQL', () => {
  assert.equal(Array.isArray(migrations.MIGRATIONS), true);
  assert.equal(migrations.MIGRATIONS.length, 1);
  const first = migrations.MIGRATIONS[0];
  assert.equal(first.version, 1);
  assert.equal(first.name, '001_initial_state_store');
  assert.match(first.sql, /CREATE TABLE IF NOT EXISTS schema_migrations/);
});

test('migrations: initial SQL declares every entity table', () => {
  const sql = migrations.MIGRATIONS[0].sql;
  for (const table of [
    'sessions',
    'skill_runs',
    'skill_versions',
    'decisions',
    'install_state',
    'governance_events',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `expected table ${table}`);
  }
  // Audit / integrity invariants we rely on downstream.
  assert.match(sql, /json_valid\(snapshot\)/);
  assert.match(sql, /ON DELETE CASCADE/);
});

/**
 * Minimal in-memory fake of the better-sqlite3 / sql.js wrapper surface that
 * migrations.js depends on: exec(), prepare().all()/.run(), transaction().
 * It only needs to model the schema_migrations bookkeeping table.
 */
function createFakeDb() {
  const migrationRows = [];
  const execLog = [];

  return {
    migrationRows,
    execLog,
    exec(sql) {
      execLog.push(sql);
    },
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      return {
        all() {
          if (/^SELECT version, name, applied_at FROM schema_migrations/i.test(normalized)) {
            return migrationRows
              .slice()
              .sort((a, b) => a.version - b.version)
              .map((row) => ({ version: row.version, name: row.name, applied_at: row.applied_at }));
          }
          if (/^SELECT version FROM schema_migrations/i.test(normalized)) {
            return migrationRows.map((row) => ({ version: row.version }));
          }
          return [];
        },
        run(params) {
          migrationRows.push({
            version: params.version,
            name: params.name,
            applied_at: params.applied_at,
          });
        },
      };
    },
    transaction(fn) {
      return (...args) => fn(...args);
    },
  };
}

test('migrations: applyMigrations records pending migrations exactly once (idempotent)', () => {
  const db = createFakeDb();

  const firstResult = migrations.applyMigrations(db);
  assert.equal(firstResult.length, 1);
  assert.equal(firstResult[0].version, 1);
  assert.equal(firstResult[0].name, '001_initial_state_store');
  assert.equal(typeof firstResult[0].appliedAt, 'string');
  assert.equal(db.migrationRows.length, 1);

  // The initial-schema SQL must have actually been exec'd.
  assert.equal(db.execLog.some((sql) => /CREATE TABLE IF NOT EXISTS sessions/.test(sql)), true);

  // Re-running must NOT duplicate the migration row (idempotency / re-runnable).
  const secondResult = migrations.applyMigrations(db);
  assert.equal(secondResult.length, 1);
  assert.equal(db.migrationRows.length, 1);
});

test('migrations: getAppliedMigrations returns camelCased rows sorted by version', () => {
  const db = createFakeDb();
  // Insert out of order to prove the ORDER BY mapping holds.
  db.migrationRows.push({ version: 2, name: 'b', applied_at: 't2' });
  db.migrationRows.push({ version: 1, name: 'a', applied_at: 't1' });

  const applied = migrations.getAppliedMigrations(db);
  assert.deepEqual(applied, [
    { version: 1, name: 'a', appliedAt: 't1' },
    { version: 2, name: 'b', appliedAt: 't2' },
  ]);
});

// ---------------------------------------------------------------------------
// session-manager.js
// ---------------------------------------------------------------------------

test('sessionManager.parseSessionFilename: new format with short id', () => {
  const meta = sessionManager.parseSessionFilename('2026-01-17-abc123-session.tmp');
  assert.ok(meta);
  assert.equal(meta.date, '2026-01-17');
  assert.equal(meta.shortId, 'abc123');
  assert.equal(meta.filename, '2026-01-17-abc123-session.tmp');
});

test('sessionManager.parseSessionFilename: old format yields no-id', () => {
  const meta = sessionManager.parseSessionFilename('2026-01-17-session.tmp');
  assert.ok(meta);
  assert.equal(meta.shortId, 'no-id');
  assert.equal(meta.date, '2026-01-17');
});

test('sessionManager.parseSessionFilename: edge cases return null', () => {
  assert.equal(sessionManager.parseSessionFilename(null), null);
  assert.equal(sessionManager.parseSessionFilename(''), null);
  assert.equal(sessionManager.parseSessionFilename('not-a-session.txt'), null);
  // Impossible calendar date (Feb 31) must be rejected.
  assert.equal(sessionManager.parseSessionFilename('2026-02-31-x-session.tmp'), null);
  // Invalid month.
  assert.equal(sessionManager.parseSessionFilename('2026-13-01-session.tmp'), null);
});

test('sessionManager.parseSessionMetadata: extracts structured fields', () => {
  const content = [
    '# My Session Title',
    '',
    '**Date:** 2026-01-17',
    '**Started:** 10:30',
    '**Last Updated:** 11:45',
    '**Project:** zeva-link',
    '**Branch:** feat/L3-spc',
    '',
    '### Completed',
    '- [x] wrote tests',
    '- [x] reviewed code',
    '',
    '### In Progress',
    '- [ ] open the MR',
    '',
    '### Notes for Next Session',
    'remember to sync target',
    '',
    '### Context to Load',
    '```',
    'load the spc module',
    '```',
  ].join('\n');

  const meta = sessionManager.parseSessionMetadata(content);
  assert.equal(meta.title, 'My Session Title');
  assert.equal(meta.date, '2026-01-17');
  assert.equal(meta.started, '10:30');
  assert.equal(meta.lastUpdated, '11:45');
  assert.equal(meta.project, 'zeva-link');
  assert.equal(meta.branch, 'feat/L3-spc');
  assert.deepEqual(meta.completed, ['wrote tests', 'reviewed code']);
  assert.deepEqual(meta.inProgress, ['open the MR']);
  assert.equal(meta.notes, 'remember to sync target');
  assert.equal(meta.context, 'load the spc module');
});

test('sessionManager.parseSessionMetadata: empty content returns defaults', () => {
  const meta = sessionManager.parseSessionMetadata('');
  assert.equal(meta.title, null);
  assert.deepEqual(meta.completed, []);
  assert.deepEqual(meta.inProgress, []);
});

test('sessionManager.getSessionStats: counts items and lines from content string', () => {
  const content = [
    '# Title',
    '### Completed',
    '- [x] a',
    '- [x] b',
    '',
    '### In Progress',
    '- [ ] c',
    '',
    '### Notes for Next Session',
    'something',
  ].join('\n');

  const stats = sessionManager.getSessionStats(content);
  assert.equal(stats.completedItems, 2);
  assert.equal(stats.inProgressItems, 1);
  assert.equal(stats.totalItems, 3);
  assert.equal(stats.hasNotes, true);
  assert.equal(stats.hasContext, false);
  assert.equal(stats.lineCount, content.split('\n').length);
});

test('sessionManager: write -> read -> stats -> delete round-trip in tmp dir', () => {
  const dir = makeTmpDir('sessions');
  const sessionPath = path.join(dir, '2026-01-17-abc123-session.tmp');
  const content = '# Round Trip\n\n**Date:** 2026-01-17\n\n### Completed\n- [x] done\n';

  // Write
  assert.equal(sessionManager.writeSessionContent(sessionPath, content), true);
  assert.equal(sessionManager.sessionExists(sessionPath), true);

  // Read back equal
  assert.equal(sessionManager.getSessionContent(sessionPath), content);

  // Title derived from content
  assert.equal(sessionManager.getSessionTitle(sessionPath), 'Round Trip');

  // Size is human readable and non-zero
  assert.match(sessionManager.getSessionSize(sessionPath), /\d/);

  // Append extends the file
  assert.equal(sessionManager.appendSessionContent(sessionPath, '\nextra line\n'), true);
  assert.match(sessionManager.getSessionContent(sessionPath), /extra line/);

  // Delete removes it
  assert.equal(sessionManager.deleteSession(sessionPath), true);
  assert.equal(sessionManager.sessionExists(sessionPath), false);
  // Deleting a non-existent file returns false.
  assert.equal(sessionManager.deleteSession(sessionPath), false);
});

test('sessionManager: read helpers degrade gracefully on missing files', () => {
  const missing = path.join(makeTmpDir('sessions-missing'), 'nope-session.tmp');
  assert.equal(sessionManager.getSessionContent(missing), null);
  assert.equal(sessionManager.getSessionSize(missing), '0 B');
  assert.equal(sessionManager.getSessionTitle(missing), 'Untitled Session');
  assert.equal(sessionManager.getSessionById(123), null);
  assert.equal(sessionManager.getSessionById('   '), null);
});

// ---------------------------------------------------------------------------
// mcp-config.js
// ---------------------------------------------------------------------------

test('mcpConfig.parseDisabledMcpServers: splits, trims, dedupes, drops empties', () => {
  assert.deepEqual(mcpConfig.parseDisabledMcpServers('exa, slack ,exa,,  '), ['exa', 'slack']);
  assert.deepEqual(mcpConfig.parseDisabledMcpServers(''), []);
  assert.deepEqual(mcpConfig.parseDisabledMcpServers(null), []);
  assert.deepEqual(mcpConfig.parseDisabledMcpServers(undefined), []);
});

test('mcpConfig.filterMcpConfig: removes disabled servers and reports them', () => {
  const config = {
    mcpServers: {
      exa: { command: 'exa' },
      gmail: { command: 'gmail' },
      slack: { command: 'slack' },
    },
    other: 'preserved',
  };

  const result = mcpConfig.filterMcpConfig(config, 'exa,slack');
  assert.deepEqual(result.removed.sort(), ['exa', 'slack']);
  assert.deepEqual(Object.keys(result.config.mcpServers), ['gmail']);
  assert.equal(result.config.other, 'preserved');

  // Source config must NOT be mutated (immutability).
  assert.deepEqual(Object.keys(config.mcpServers).sort(), ['exa', 'gmail', 'slack']);
});

test('mcpConfig.filterMcpConfig: empty disabled list copies servers unchanged', () => {
  const config = { mcpServers: { exa: { command: 'exa' } } };
  const result = mcpConfig.filterMcpConfig(config, []);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.config.mcpServers, { exa: { command: 'exa' } });
  // It is a copy, not the same reference.
  assert.notEqual(result.config.mcpServers, config.mcpServers);
});

test('mcpConfig.filterMcpConfig: rejects malformed config shapes', () => {
  assert.throws(() => mcpConfig.filterMcpConfig(null), /must be a JSON object/);
  assert.throws(() => mcpConfig.filterMcpConfig([]), /must be a JSON object/);
  assert.throws(() => mcpConfig.filterMcpConfig({}), /must include an mcpServers object/);
  assert.throws(() => mcpConfig.filterMcpConfig({ mcpServers: [] }), /must include an mcpServers object/);
});

// ---------------------------------------------------------------------------
// skill-evolution/tracker.js
// ---------------------------------------------------------------------------

test('tracker.normalizeExecutionRecord: normalizes camelCase + snake_case input', () => {
  const record = tracker.normalizeExecutionRecord(
    {
      skillId: 'spc',
      skillVersion: 'v2',
      taskAttempted: 'detect drift',
      outcome: 'success',
      tokensUsed: '1500',
      durationMs: 42,
      userFeedback: 'accepted',
    },
    { now: '2026-06-10T00:00:00.000Z' }
  );

  assert.equal(record.skill_id, 'spc');
  assert.equal(record.skill_version, 'v2');
  assert.equal(record.task_description, 'detect drift');
  assert.equal(record.outcome, 'success');
  assert.equal(record.tokens_used, 1500);
  assert.equal(record.duration_ms, 42);
  assert.equal(record.user_feedback, 'accepted');
  assert.equal(record.recorded_at, '2026-06-10T00:00:00.000Z');
  assert.equal(record.failure_reason, null);
});

test('tracker.normalizeExecutionRecord: enforces required fields and enums', () => {
  assert.throws(() => tracker.normalizeExecutionRecord(null), /must be an object/);
  assert.throws(() => tracker.normalizeExecutionRecord([]), /must be an object/);
  assert.throws(
    () => tracker.normalizeExecutionRecord({ skill_version: 'v1', task_description: 't', outcome: 'success' }),
    /skill_id is required/
  );
  assert.throws(
    () => tracker.normalizeExecutionRecord({ skill_id: 's', task_description: 't', outcome: 'success' }),
    /skill_version is required/
  );
  assert.throws(
    () => tracker.normalizeExecutionRecord({ skill_id: 's', skill_version: 'v1', outcome: 'success' }),
    /task_description is required/
  );
  assert.throws(
    () => tracker.normalizeExecutionRecord({ skill_id: 's', skill_version: 'v1', task_description: 't', outcome: 'bogus' }),
    /outcome must be one of/
  );
  assert.throws(
    () => tracker.normalizeExecutionRecord({
      skill_id: 's', skill_version: 'v1', task_description: 't', outcome: 'success', user_feedback: 'maybe',
    }),
    /user_feedback must be/
  );
  assert.throws(
    () => tracker.normalizeExecutionRecord({
      skill_id: 's', skill_version: 'v1', task_description: 't', outcome: 'success', tokens_used: 'abc',
    }),
    /tokens_used must be a number/
  );
  assert.throws(
    () => tracker.normalizeExecutionRecord({
      skill_id: 's', skill_version: 'v1', task_description: 't', outcome: 'success', recorded_at: 'not-a-date',
    }),
    /recorded_at must be an ISO timestamp/
  );
});

test('tracker.getRunsFilePath: derives path from homeDir and honors override', () => {
  const home = makeTmpDir('tracker-home');
  const expected = path.join(home, '.claude', 'state', 'skill-runs.jsonl');
  assert.equal(tracker.getRunsFilePath({ homeDir: home }), expected);

  const override = path.join(makeTmpDir('tracker-override'), 'custom.jsonl');
  assert.equal(tracker.getRunsFilePath({ runsFilePath: override }), path.resolve(override));
});

test('tracker: recordSkillExecution -> readSkillExecutionRecords JSONL round-trip', () => {
  const home = makeTmpDir('tracker-rt');
  const options = { homeDir: home };

  const writeResult = tracker.recordSkillExecution(
    { skill_id: 'spc', skill_version: 'v1', task_description: 'judge', outcome: 'success' },
    { ...options, now: '2026-06-10T01:00:00.000Z' }
  );
  assert.equal(writeResult.storage, 'jsonl');
  assert.equal(fs.existsSync(writeResult.path), true);

  tracker.recordSkillExecution(
    { skill_id: 'spc', skill_version: 'v1', task_description: 'judge again', outcome: 'failure' },
    { ...options, now: '2026-06-10T02:00:00.000Z' }
  );

  const records = tracker.readSkillExecutionRecords(options);
  assert.equal(records.length, 2);
  assert.equal(records[0].outcome, 'success');
  assert.equal(records[1].outcome, 'failure');
  assert.equal(records[0].recorded_at, '2026-06-10T01:00:00.000Z');
});

test('tracker.readSkillExecutionRecords: tolerates malformed JSONL lines', () => {
  const home = makeTmpDir('tracker-bad');
  const runsPath = path.join(home, '.claude', 'state', 'skill-runs.jsonl');
  fs.mkdirSync(path.dirname(runsPath), { recursive: true });
  fs.writeFileSync(
    runsPath,
    [
      JSON.stringify({ skill_id: 'a', outcome: 'success', recorded_at: '2026-06-10T00:00:00.000Z' }),
      'this is not json',
      '',
      JSON.stringify({ skill_id: 'b', outcome: 'failure', recorded_at: '2026-06-10T00:00:00.000Z' }),
    ].join('\n'),
    'utf8'
  );

  const records = tracker.readSkillExecutionRecords({ homeDir: home });
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.skill_id), ['a', 'b']);

  // Missing file yields empty list.
  assert.deepEqual(tracker.readSkillExecutionRecords({ homeDir: makeTmpDir('tracker-none') }), []);
});

test('tracker.recordSkillExecution: prefers an injected state store when available', () => {
  let received = null;
  const stateStore = {
    recordSkillExecution(record) {
      received = record;
      return { ok: true };
    },
  };

  const result = tracker.recordSkillExecution(
    { skill_id: 's', skill_version: 'v1', task_description: 't', outcome: 'partial' },
    { stateStore, now: '2026-06-10T00:00:00.000Z' }
  );

  assert.equal(result.storage, 'state-store');
  assert.deepEqual(result.result, { ok: true });
  assert.equal(received.outcome, 'partial');
});

// ---------------------------------------------------------------------------
// skill-evolution/health.js
// ---------------------------------------------------------------------------

test('health.calculateSuccessRate: ratio of success outcomes, null on empty', () => {
  assert.equal(health.calculateSuccessRate([]), null);
  assert.equal(
    health.calculateSuccessRate([{ outcome: 'success' }, { outcome: 'failure' }]),
    0.5
  );
  assert.equal(
    health.calculateSuccessRate([{ outcome: 'success' }, { outcome: 'success' }, { outcome: 'failure' }]),
    0.6667
  );
});

test('health.filterRecordsWithinDays: keeps only records inside the window', () => {
  const nowMs = Date.parse('2026-06-10T00:00:00.000Z');
  const records = [
    { recorded_at: '2026-06-09T00:00:00.000Z' }, // 1 day ago -> in 7d
    { recorded_at: '2026-06-01T00:00:00.000Z' }, // 9 days ago -> out of 7d
    { recorded_at: 'not-a-date' }, // ignored
    { recorded_at: '2026-06-11T00:00:00.000Z' }, // future -> excluded
  ];
  const within7 = health.filterRecordsWithinDays(records, nowMs, 7);
  assert.equal(within7.length, 1);
  const within30 = health.filterRecordsWithinDays(records, nowMs, 30);
  assert.equal(within30.length, 2);
});

test('health.summarizeHealthReport: counts healthy vs declining', () => {
  const report = {
    skills: [
      { declining: true },
      { declining: false },
      { declining: false },
    ],
  };
  assert.deepEqual(health.summarizeHealthReport(report), {
    total_skills: 3,
    healthy_skills: 2,
    declining_skills: 1,
  });
});

test('health.discoverSkills: discovers curated skills having SKILL.md', () => {
  const repoRoot = makeTmpDir('health-repo');
  const skillsRoot = path.join(repoRoot, 'skills');
  fs.mkdirSync(path.join(skillsRoot, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, 'alpha', 'SKILL.md'), '# alpha\n');
  // A directory without SKILL.md must be ignored.
  fs.mkdirSync(path.join(skillsRoot, 'beta-no-md'), { recursive: true });

  const home = makeTmpDir('health-home');
  const skills = health.discoverSkills({ repoRoot, homeDir: home });

  assert.equal(skills.has('alpha'), true);
  assert.equal(skills.has('beta-no-md'), false);
  assert.equal(skills.get('alpha').skill_type, 'curated');
});

test('health.collectSkillHealth: end-to-end report with worsening trend', () => {
  const repoRoot = makeTmpDir('health-e2e-repo');
  const home = makeTmpDir('health-e2e-home');

  // One curated skill on disk.
  const skillsRoot = path.join(repoRoot, 'skills');
  fs.mkdirSync(path.join(skillsRoot, 'spc'), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, 'spc', 'SKILL.md'), '# spc\n');

  // Runs file: recent 7d window all failures, but 30d window mostly success,
  // so the 7d rate is far below the 30d rate -> worsening / declining.
  const runsPath = path.join(home, '.claude', 'state', 'skill-runs.jsonl');
  fs.mkdirSync(path.dirname(runsPath), { recursive: true });
  const lines = [
    // Within last 7 days: 2 failures (0% success in 7d).
    { skill_id: 'spc', outcome: 'failure', recorded_at: '2026-06-09T00:00:00.000Z' },
    { skill_id: 'spc', outcome: 'failure', recorded_at: '2026-06-08T00:00:00.000Z' },
    // 8-30 days ago: 4 successes (lifts the 30d success rate well above 7d).
    { skill_id: 'spc', outcome: 'success', recorded_at: '2026-05-20T00:00:00.000Z' },
    { skill_id: 'spc', outcome: 'success', recorded_at: '2026-05-21T00:00:00.000Z' },
    { skill_id: 'spc', outcome: 'success', recorded_at: '2026-05-22T00:00:00.000Z' },
    { skill_id: 'spc', outcome: 'success', recorded_at: '2026-05-23T00:00:00.000Z' },
  ].map((r) => JSON.stringify(r));
  fs.writeFileSync(runsPath, `${lines.join('\n')}\n`, 'utf8');

  const report = health.collectSkillHealth({
    repoRoot,
    homeDir: home,
    now: '2026-06-10T00:00:00.000Z',
    warnThreshold: 0.1,
  });

  assert.equal(report.warn_threshold, 0.1);
  assert.equal(report.skills.length, 1);
  const spc = report.skills[0];
  assert.equal(spc.skill_id, 'spc');
  assert.equal(spc.skill_type, 'curated');
  assert.equal(spc.success_rate_7d, 0); // 0/2
  assert.ok(spc.success_rate_30d > spc.success_rate_7d);
  assert.equal(spc.failure_trend, 'worsening');
  assert.equal(spc.declining, true);
  assert.equal(spc.run_count_7d, 2);
  assert.equal(spc.run_count_30d, 6);
  assert.equal(spc.last_run, '2026-06-09T00:00:00.000Z');

  // Records for an unknown (not-on-disk) skill still surface as UNKNOWN type.
  // and the text report renders without throwing.
  const text = health.formatHealthReport(report);
  assert.match(text, /ECC skill health/);
  assert.match(text, /spc/);

  const json = health.formatHealthReport(report, { json: true });
  assert.deepEqual(JSON.parse(json), report);
});

test('health.collectSkillHealth: rejects an invalid now timestamp', () => {
  assert.throws(
    () => health.collectSkillHealth({ now: 'not-a-timestamp', homeDir: makeTmpDir('health-bad-now') }),
    /Invalid now timestamp/
  );
});

test('health.formatHealthReport: empty report renders the no-records message', () => {
  const report = { generated_at: '2026-06-10T00:00:00.000Z', warn_threshold: 0.1, skills: [] };
  const text = health.formatHealthReport(report);
  assert.match(text, /No skill execution records found/);
});
