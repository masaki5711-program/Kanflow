'use strict';

/**
 * Unit / integration tests for the ECC "session systems" subsystem.
 *
 * Targets (scripts/lib/):
 *   - session-adapters/registry.js          (full surface)
 *   - session-adapters/canonical-session.js (validation, normalization, recording, persist)
 *   - session-adapters/claude-history.js    (target parsing, adapter open/snapshot)
 *   - session-adapters/dmux-tmux.js          (target detection, adapter open/snapshot)
 *   - observer-sessions.js                  (project context, session leases, observer stop)
 *   - orchestration-session.js              (markdown parsing, snapshot building, tmux pane listing)
 *
 * Strategy:
 *   - Node built-ins ONLY (node:test, node:assert/strict, node:os/path/fs).
 *   - All filesystem state isolated under os.tmpdir(); removed in test.after().
 *   - Home (~/.claude) reads redirected via HOME / USERPROFILE env (see utils.getHomeDir).
 *   - Recording dir redirected via ECC_SESSION_RECORDING_DIR / recordingDir option.
 *   - Observer paths redirected via CLAUDE_PROJECT_DIR + HOME + CLAUDE_SESSION_ID.
 *   - Adapters that would shell out (tmux) are exercised through dependency-injection
 *     of collectSessionSnapshotImpl / spawnSyncImpl, plus synthetic fixture files.
 *   - The real ../state-store driver requires the uninstalled "sql.js" package, so
 *     its LIVE persist path is out of scope here. We exercise persist via (a) an
 *     injected loadStateStoreImpl returning null -> JSON-file recording backend, and
 *     (b) a stub stateStore object -> state-store backend. The sql.js-backed driver
 *     itself is the one skipped part (cannot load with Node built-ins only).
 *
 * Env is saved & restored per test block so the run is deterministic & cross-platform.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const LIB = path.join(__dirname, '..');

const registry = require(path.join(LIB, 'session-adapters', 'registry.js'));
const canonical = require(path.join(LIB, 'session-adapters', 'canonical-session.js'));
const claudeHistory = require(path.join(LIB, 'session-adapters', 'claude-history.js'));
const dmuxTmux = require(path.join(LIB, 'session-adapters', 'dmux-tmux.js'));
const observerSessions = require(path.join(LIB, 'observer-sessions.js'));
const orchestration = require(path.join(LIB, 'orchestration-session.js'));

// ---------------------------------------------------------------------------
// Shared temp-dir + env bookkeeping
// ---------------------------------------------------------------------------
const tmpDirs = [];

function makeTmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ecc-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

const ENV_KEYS = [
  'HOME',
  'USERPROFILE',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_SESSION_ID',
  'ECC_SESSION_RECORDING_DIR'
];

function snapshotEnv() {
  const saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
  }
  return saved;
}

function restoreEnv(saved) {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
}

/** Point ~/.claude at a fresh temp home; returns the claude dir path. */
function redirectHome(prefix) {
  const home = makeTmpDir(prefix);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return path.join(home, '.claude');
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
// Fixture builders
// ---------------------------------------------------------------------------

/** A valid canonical snapshot with one worker, for validation/recording tests. */
function buildValidSnapshot(overrides = {}) {
  const worker = {
    id: 'w1',
    label: 'worker one',
    state: 'running',
    health: 'healthy',
    branch: 'feat/x',
    worktree: null,
    runtime: {
      kind: 'tmux-pane',
      command: 'claude',
      active: true,
      dead: false
    },
    intent: {
      objective: 'do the thing',
      seedPaths: ['a.md', 'b.md']
    },
    outputs: {
      summary: ['did a'],
      validation: ['tested a'],
      remainingRisks: []
    },
    artifacts: {}
  };

  return {
    schemaVersion: canonical.SESSION_SCHEMA_VERSION,
    adapterId: 'dmux-tmux',
    session: {
      id: 'sess-1',
      kind: 'orchestrated',
      state: 'active',
      repoRoot: null,
      sourceTarget: { type: 'session', value: 'sess-1' }
    },
    workers: [worker],
    aggregates: canonical.buildAggregates([worker]),
    ...overrides
  };
}

/** Write a Claude session .tmp file into the redirected ~/.claude/session-data dir. */
function writeClaudeSession(claudeDir, filename, content) {
  const dir = path.join(claudeDir, 'session-data');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

const SESSION_MARKDOWN = [
  '# My Session Title',
  '',
  '**Date:** 2026-06-01',
  '**Branch:** feat/abc',
  '**Worktree:** /tmp/wt',
  '',
  '### Completed',
  '- [x] First done item',
  '- [x] Second done item',
  '',
  '### In Progress',
  '- [ ] Ongoing work',
  '',
  '### Notes for Next Session',
  'remember to rerun evals',
  '',
  '### Context to Load',
  '```',
  'src/main.js',
  'docs/spec.md',
  '```',
  ''
].join('\n');

/** Build a raw dmux snapshot (as orchestration-session.collectSessionSnapshot returns). */
function buildRawDmuxSnapshot(overrides = {}) {
  return {
    sessionName: 'orchestra-1',
    coordinationDir: '/tmp/coord',
    repoRoot: '/tmp/repo',
    sessionActive: true,
    paneCount: 1,
    workerCount: 1,
    workerStates: { running: 1 },
    panes: [],
    workers: [
      {
        workerSlug: 'frontend',
        status: { state: 'running', updated: new Date().toISOString(), branch: 'feat/ui', worktree: '/tmp/wt-ui' },
        task: { objective: 'build UI', seedPaths: ['ui.md'] },
        handoff: { summary: ['ui scaffold'], validation: [], remainingRisks: ['a11y'] },
        files: { status: 's', task: 't', handoff: 'h' },
        pane: { currentCommand: 'node', pid: 4242, active: true, dead: false }
      }
    ],
    ...overrides
  };
}

// ===========================================================================
// canonical-session.js
// ===========================================================================

test('buildAggregates counts workers by state and health', () => {
  // Arrange
  const workers = [
    { state: 'running', health: 'healthy' },
    { state: 'running', health: 'stale' },
    { state: 'failed', health: 'degraded' }
  ];

  // Act
  const aggregates = canonical.buildAggregates(workers);

  // Assert
  assert.equal(aggregates.workerCount, 3);
  assert.deepEqual(aggregates.states, { running: 2, failed: 1 });
  assert.deepEqual(aggregates.healths, { healthy: 1, stale: 1, degraded: 1 });
});

test('buildAggregates defaults missing state/health to unknown', () => {
  const aggregates = canonical.buildAggregates([{}, {}]);
  assert.deepEqual(aggregates.states, { unknown: 2 });
  assert.deepEqual(aggregates.healths, { unknown: 2 });
});

test('validateCanonicalSnapshot returns the snapshot for a valid object', () => {
  const snapshot = buildValidSnapshot();
  const result = canonical.validateCanonicalSnapshot(snapshot);
  assert.equal(result, snapshot);
});

test('validateCanonicalSnapshot rejects a non-object', () => {
  assert.throws(() => canonical.validateCanonicalSnapshot(null), /must be an object/);
  assert.throws(() => canonical.validateCanonicalSnapshot([]), /must be an object/);
});

test('validateCanonicalSnapshot rejects an unsupported schema version', () => {
  const snapshot = buildValidSnapshot({ schemaVersion: 'ecc.session.v999' });
  assert.throws(() => canonical.validateCanonicalSnapshot(snapshot), /Unsupported canonical session schema version/);
});

test('validateCanonicalSnapshot rejects a missing required string field', () => {
  const snapshot = buildValidSnapshot();
  delete snapshot.adapterId;
  assert.throws(() => canonical.validateCanonicalSnapshot(snapshot), /adapterId/);
});

test('validateCanonicalSnapshot rejects workers that are not an array', () => {
  const snapshot = buildValidSnapshot({ workers: 'nope' });
  assert.throws(() => canonical.validateCanonicalSnapshot(snapshot), /workers to be an array/);
});

test('validateCanonicalSnapshot rejects a worker missing required runtime booleans', () => {
  const snapshot = buildValidSnapshot();
  snapshot.workers[0].runtime.active = 'yes'; // not a boolean
  assert.throws(() => canonical.validateCanonicalSnapshot(snapshot), /runtime\.active to be a boolean/);
});

test('validateCanonicalSnapshot rejects when aggregates.workerCount mismatches workers.length', () => {
  const snapshot = buildValidSnapshot();
  snapshot.aggregates.workerCount = 99;
  assert.throws(() => canonical.validateCanonicalSnapshot(snapshot), /aggregates\.workerCount to match/);
});

test('normalizeDmuxSnapshot produces a valid canonical snapshot (happy path)', () => {
  // Arrange
  const raw = buildRawDmuxSnapshot();
  const sourceTarget = { type: 'session', value: 'orchestra-1' };

  // Act
  const snapshot = canonical.normalizeDmuxSnapshot(raw, sourceTarget);

  // Assert
  assert.equal(snapshot.adapterId, 'dmux-tmux');
  assert.equal(snapshot.session.id, 'orchestra-1');
  assert.equal(snapshot.session.state, 'active');
  assert.equal(snapshot.workers.length, 1);
  assert.equal(snapshot.workers[0].id, 'frontend');
  assert.equal(snapshot.workers[0].health, 'healthy');
  assert.equal(snapshot.workers[0].runtime.pid, 4242);
  assert.deepEqual(snapshot.workers[0].intent.seedPaths, ['ui.md']);
});

test('normalizeDmuxSnapshot derives missing session state when inactive with no workers', () => {
  const raw = buildRawDmuxSnapshot({
    sessionActive: false,
    workerCount: 0,
    workerStates: {},
    workers: []
  });
  const snapshot = canonical.normalizeDmuxSnapshot(raw, { type: 'session', value: 'empty' });
  assert.equal(snapshot.session.state, 'missing');
  assert.equal(snapshot.aggregates.workerCount, 0);
});

test('normalizeDmuxSnapshot marks a failed worker as degraded health and failed session', () => {
  const raw = buildRawDmuxSnapshot({
    sessionActive: false,
    workerStates: { failed: 1 },
    workers: [
      {
        workerSlug: 'broken',
        status: { state: 'failed', updated: new Date().toISOString() },
        task: { objective: 'x', seedPaths: [] },
        handoff: { summary: [], validation: [], remainingRisks: [] },
        files: { status: 's', task: 't', handoff: 'h' },
        pane: null
      }
    ]
  });
  const snapshot = canonical.normalizeDmuxSnapshot(raw, { type: 'session', value: 'broken' });
  assert.equal(snapshot.session.state, 'failed');
  assert.equal(snapshot.workers[0].health, 'degraded');
  assert.equal(snapshot.workers[0].runtime.active, false);
  assert.equal(snapshot.workers[0].branch, null);
});

test('normalizeClaudeHistorySession produces a valid recorded snapshot', () => {
  // Arrange
  const session = {
    shortId: 'abc123',
    filename: '2026-06-01-abc123-session.tmp',
    sessionPath: '/tmp/2026-06-01-abc123-session.tmp',
    metadata: {
      title: 'History Title',
      branch: 'feat/h',
      worktree: '/tmp/wt',
      completed: ['done 1'],
      inProgress: ['ongoing 1'],
      notes: 'a note',
      context: 'src/a.js\nsrc/b.js'
    }
  };

  // Act
  const snapshot = canonical.normalizeClaudeHistorySession(session, { type: 'claude-history', value: 'abc123' });

  // Assert
  assert.equal(snapshot.adapterId, 'claude-history');
  assert.equal(snapshot.session.id, 'abc123');
  assert.equal(snapshot.session.state, 'recorded');
  assert.equal(snapshot.workers[0].state, 'recorded');
  assert.equal(snapshot.workers[0].health, 'healthy');
  assert.equal(snapshot.workers[0].intent.objective, 'ongoing 1');
  assert.deepEqual(snapshot.workers[0].intent.seedPaths, ['src/a.js', 'src/b.js']);
  assert.deepEqual(snapshot.workers[0].outputs.summary, ['done 1']);
  assert.deepEqual(snapshot.workers[0].outputs.remainingRisks, ['a note']);
});

test('normalizeClaudeHistorySession falls back to title objective and no-id worker id', () => {
  const session = {
    shortId: 'no-id',
    filename: '2026-06-01-session.tmp',
    sessionPath: '/tmp/2026-06-01-session.tmp',
    metadata: { title: 'Just A Title' }
  };
  const snapshot = canonical.normalizeClaudeHistorySession(session, { type: 'session-file', value: '/tmp/x' });
  // worker id derived from filename basename (sans .tmp) when shortId is no-id
  assert.equal(snapshot.session.id, '2026-06-01-session');
  assert.equal(snapshot.workers[0].intent.objective, 'Just A Title');
  assert.deepEqual(snapshot.workers[0].intent.seedPaths, []);
});

test('getFallbackSessionRecordingPath sanitizes adapterId and session id', () => {
  const recordingDir = makeTmpDir('rec-path');
  const snapshot = buildValidSnapshot();
  snapshot.session.id = 'weird/id with spaces';
  const filePath = canonical.getFallbackSessionRecordingPath(snapshot, { recordingDir });
  assert.ok(filePath.startsWith(path.resolve(recordingDir)));
  assert.ok(filePath.endsWith('.json'));
  // sanitized: slashes/spaces collapse to underscores, no raw separators in the leaf
  assert.ok(!path.basename(filePath).includes(' '));
});

test('persistCanonicalSnapshot writes a JSON-file recording when no state-store exists', () => {
  // Arrange
  const recordingDir = makeTmpDir('rec-write');
  const snapshot = buildValidSnapshot();

  // Act: force the "no state store" path via an impl that throws MODULE_NOT_FOUND for ../state-store
  const loadStateStoreImpl = () => {
    const err = new Error("Cannot find module '../state-store'");
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  };
  const result = canonical.persistCanonicalSnapshot(snapshot, { recordingDir, loadStateStoreImpl });

  // Assert
  assert.equal(result.backend, 'json-file');
  assert.ok(fs.existsSync(result.path));
  const written = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.equal(written.adapterId, snapshot.adapterId);
  assert.equal(written.sessionId, snapshot.session.id);
  assert.deepEqual(written.latest, snapshot);
  assert.equal(written.history.length, 1);
});

test('persistCanonicalSnapshot honors persist:false (skipped backend, no file)', () => {
  const recordingDir = makeTmpDir('rec-skip');
  const snapshot = buildValidSnapshot();
  const result = canonical.persistCanonicalSnapshot(snapshot, { recordingDir, persist: false });
  assert.equal(result.backend, 'skipped');
  assert.equal(result.path, null);
});

test('persistCanonicalSnapshot uses a provided stateStore writer (state-store backend)', () => {
  const calls = [];
  const stateStore = {
    persistCanonicalSessionSnapshot(snap, meta) {
      calls.push({ snap, meta });
    }
  };
  const snapshot = buildValidSnapshot();
  const result = canonical.persistCanonicalSnapshot(snapshot, { stateStore });
  assert.equal(result.backend, 'state-store');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].meta.sessionId, snapshot.session.id);
});

test('persistCanonicalSnapshot appends history on a changed second write', () => {
  const recordingDir = makeTmpDir('rec-history');
  const loadStateStoreImpl = () => null; // no writer -> factory-module path -> json file
  const first = buildValidSnapshot();
  canonical.persistCanonicalSnapshot(first, { recordingDir, loadStateStoreImpl });

  const second = buildValidSnapshot();
  second.session.state = 'completed'; // change the snapshot content
  const result = canonical.persistCanonicalSnapshot(second, { recordingDir, loadStateStoreImpl });

  const written = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.equal(written.history.length, 2);
  assert.equal(written.latest.session.state, 'completed');
});

// ===========================================================================
// registry.js
// ===========================================================================

test('normalizeStructuredTarget passes through a plain string target', () => {
  const result = registry.normalizeStructuredTarget('plain-target', { adapterId: 'x' });
  assert.equal(result.target, 'plain-target');
  assert.deepEqual(result.context, { adapterId: 'x' });
});

test('normalizeStructuredTarget maps a claude-history structured target to a claude: prefix', () => {
  const result = registry.normalizeStructuredTarget({ type: 'claude-history', value: 'latest' });
  assert.equal(result.target, 'claude:latest');
  assert.equal(result.context.adapterId, 'claude-history');
});

test('normalizeStructuredTarget maps a session structured target to the dmux adapter', () => {
  const result = registry.normalizeStructuredTarget({ type: 'session', value: 'my-session' });
  assert.equal(result.target, 'my-session');
  assert.equal(result.context.adapterId, 'dmux-tmux');
});

test('normalizeStructuredTarget rejects an empty value', () => {
  assert.throws(
    () => registry.normalizeStructuredTarget({ type: 'session', value: '   ' }),
    /non-empty string value/
  );
});

test('normalizeStructuredTarget rejects an empty type', () => {
  assert.throws(
    () => registry.normalizeStructuredTarget({ type: '   ', value: 'x' }),
    /non-empty type/
  );
});

test('createDefaultAdapters returns the two built-in adapters', () => {
  const adapters = registry.createDefaultAdapters({ persistSnapshots: false });
  const ids = adapters.map(a => a.id).sort();
  assert.deepEqual(ids, ['claude-history', 'dmux-tmux']);
});

test('createAdapterRegistry: getAdapter, listAdapters, and unknown-adapter error', () => {
  const reg = registry.createAdapterRegistry({ persistSnapshots: false });

  const listed = reg.listAdapters();
  assert.equal(listed.length, 2);
  assert.ok(listed.every(entry => typeof entry.id === 'string' && Array.isArray(entry.targetTypes)));

  const adapter = reg.getAdapter('claude-history');
  assert.equal(adapter.id, 'claude-history');

  assert.throws(() => reg.getAdapter('does-not-exist'), /Unknown session adapter/);
});

test('createAdapterRegistry.select uses adapterId from a structured target', () => {
  const reg = registry.createAdapterRegistry({ persistSnapshots: false });
  const adapter = reg.select({ type: 'claude-history', value: 'latest' });
  assert.equal(adapter.id, 'claude-history');
});

test('createAdapterRegistry.select throws when no adapter matches', () => {
  const reg = registry.createAdapterRegistry({ persistSnapshots: false });
  // a bare non-existent, non-prefixed target in a fresh cwd matches nothing
  const unmatchable = path.join(makeTmpDir('nomatch'), 'totally-not-a-session');
  assert.throws(() => reg.select(unmatchable, { cwd: makeTmpDir('nomatch-cwd') }), /No session adapter matched/);
});

test('createAdapterRegistry uses injected adapters and opens via select', () => {
  // Arrange: a stub adapter capturing open() args
  const opened = [];
  const stub = {
    id: 'stub',
    description: 'stub adapter',
    targetTypes: ['stub'],
    canOpen(target) {
      return target === 'hit';
    },
    open(target, context) {
      opened.push({ target, context });
      // registry.open() returns the opened object itself (the caller invokes getSnapshot)
      return { getSnapshot: () => ({ ok: true, target }) };
    }
  };
  const reg = registry.createAdapterRegistry({ adapters: [stub] });

  // Act
  const handle = reg.open('hit', { extra: 1 });
  const snapshot = handle.getSnapshot();

  // Assert
  assert.deepEqual(snapshot, { ok: true, target: 'hit' });
  assert.equal(opened.length, 1);
  assert.equal(opened[0].target, 'hit');
});

// ===========================================================================
// claude-history.js
// ===========================================================================

test('parseClaudeTarget extracts the value after a known prefix', () => {
  assert.equal(claudeHistory.parseClaudeTarget('claude:latest'), 'latest');
  assert.equal(claudeHistory.parseClaudeTarget('claude-history: abc '), 'abc');
  assert.equal(claudeHistory.parseClaudeTarget('history:xyz'), 'xyz');
});

test('parseClaudeTarget returns null for non-prefixed / non-string input', () => {
  assert.equal(claudeHistory.parseClaudeTarget('not-a-claude-target'), null);
  assert.equal(claudeHistory.parseClaudeTarget(42), null);
});

test('isSessionFileTarget recognizes an existing .tmp file', () => {
  const cwd = makeTmpDir('isfile');
  const tmpFile = path.join(cwd, 'a-session.tmp');
  fs.writeFileSync(tmpFile, 'x', 'utf8');
  assert.equal(claudeHistory.isSessionFileTarget('a-session.tmp', cwd), true);
  assert.equal(claudeHistory.isSessionFileTarget('missing.tmp', cwd), false);
  assert.equal(claudeHistory.isSessionFileTarget('', cwd), false);
});

test('claude-history adapter canOpen respects adapterId context and target shape', () => {
  const adapter = claudeHistory.createClaudeHistoryAdapter({ persistSnapshots: false });
  assert.equal(adapter.id, 'claude-history');

  // forced to a different adapter -> false
  assert.equal(adapter.canOpen('claude:latest', { adapterId: 'dmux-tmux' }), false);
  // forced to this adapter -> true regardless of target
  assert.equal(adapter.canOpen('anything', { adapterId: 'claude-history' }), true);
  // claude: prefixed target -> true
  assert.equal(adapter.canOpen('claude:latest', { cwd: makeTmpDir('co') }), true);
});

test('claude-history adapter open().getSnapshot resolves a session-file target end-to-end', () => {
  const saved = snapshotEnv();
  try {
    // Arrange: redirect home so session-manager / aliases never touch the real ~/.claude
    redirectHome('claude-home');
    const recordingDir = makeTmpDir('claude-rec');
    const cwd = makeTmpDir('claude-cwd');
    const filePath = path.join(cwd, '2026-06-01-abc123-session.tmp');
    fs.writeFileSync(filePath, SESSION_MARKDOWN, 'utf8');

    // Inject loadStateStoreImpl: () => null so persist uses the JSON-file fallback
    // instead of requiring the real ../state-store (which needs the uninstalled sql.js).
    const adapter = claudeHistory.createClaudeHistoryAdapter({ recordingDir, loadStateStoreImpl: () => null });

    // Act
    const snapshot = adapter.open('2026-06-01-abc123-session.tmp', { cwd }).getSnapshot();

    // Assert
    assert.equal(snapshot.adapterId, 'claude-history');
    assert.equal(snapshot.session.sourceTarget.type, 'session-file');
    assert.equal(snapshot.session.id, 'abc123');
    assert.equal(snapshot.workers[0].label, 'My Session Title');
    assert.deepEqual(snapshot.workers[0].outputs.summary, ['First done item', 'Second done item']);
    assert.deepEqual(snapshot.workers[0].intent.seedPaths, ['src/main.js', 'docs/spec.md']);

    // recording was written under the redirected recordingDir
    const recorded = canonical.getFallbackSessionRecordingPath(snapshot, { recordingDir });
    assert.ok(fs.existsSync(recorded));
  } finally {
    restoreEnv(saved);
  }
});

test('claude-history adapter getSnapshot throws on an unsupported target', () => {
  const saved = snapshotEnv();
  try {
    redirectHome('claude-home-bad');
    const cwd = makeTmpDir('claude-bad-cwd');
    const adapter = claudeHistory.createClaudeHistoryAdapter({ persistSnapshots: false });
    assert.throws(
      () => adapter.open('not-a-real-target', { cwd }).getSnapshot(),
      /Unsupported Claude session target/
    );
  } finally {
    restoreEnv(saved);
  }
});

// ===========================================================================
// dmux-tmux.js
// ===========================================================================

test('isPlanFileTarget recognizes an existing .json file', () => {
  const cwd = makeTmpDir('plan');
  const planFile = path.join(cwd, 'plan.json');
  fs.writeFileSync(planFile, '{}', 'utf8');
  assert.equal(dmuxTmux.isPlanFileTarget('plan.json', cwd), true);
  assert.equal(dmuxTmux.isPlanFileTarget('plan.txt', cwd), false);
  assert.equal(dmuxTmux.isPlanFileTarget('', cwd), false);
});

test('isSessionNameTarget recognizes a coordination directory', () => {
  const cwd = makeTmpDir('sessname');
  const coordDir = path.join(cwd, '.claude', 'orchestration', 'my-session');
  fs.mkdirSync(coordDir, { recursive: true });
  assert.equal(dmuxTmux.isSessionNameTarget('my-session', cwd), true);
  assert.equal(dmuxTmux.isSessionNameTarget('absent', cwd), false);
  assert.equal(dmuxTmux.isSessionNameTarget('', cwd), false);
});

test('dmux-tmux adapter canOpen respects adapterId and target detection', () => {
  const cwd = makeTmpDir('dmux-canopen');
  fs.writeFileSync(path.join(cwd, 'p.json'), '{}', 'utf8');
  const adapter = dmuxTmux.createDmuxTmuxAdapter({ persistSnapshots: false });

  assert.equal(adapter.id, 'dmux-tmux');
  assert.equal(adapter.canOpen('p.json', { adapterId: 'claude-history' }), false);
  assert.equal(adapter.canOpen('whatever', { adapterId: 'dmux-tmux' }), true);
  assert.equal(adapter.canOpen('p.json', { cwd }), true);
});

test('dmux-tmux adapter open().getSnapshot normalizes an injected raw snapshot', () => {
  const recordingDir = makeTmpDir('dmux-rec');
  const cwd = makeTmpDir('dmux-cwd');

  // Inject the collector so no real tmux is invoked.
  const collectSessionSnapshotImpl = (target, gotCwd) => {
    assert.equal(target, 'orchestra-1');
    assert.equal(gotCwd, cwd);
    return buildRawDmuxSnapshot();
  };

  const adapter = dmuxTmux.createDmuxTmuxAdapter({ recordingDir, collectSessionSnapshotImpl, loadStateStoreImpl: () => null });
  const snapshot = adapter.open('orchestra-1', { cwd }).getSnapshot();

  assert.equal(snapshot.adapterId, 'dmux-tmux');
  assert.equal(snapshot.session.sourceTarget.type, 'session');
  assert.equal(snapshot.workers[0].id, 'frontend');

  const recorded = canonical.getFallbackSessionRecordingPath(snapshot, { recordingDir });
  assert.ok(fs.existsSync(recorded));
});

test('dmux-tmux adapter builds a plan sourceTarget when target is a .json file', () => {
  const recordingDir = makeTmpDir('dmux-plan-rec');
  const cwd = makeTmpDir('dmux-plan-cwd');
  const planFile = path.join(cwd, 'plan.json');
  fs.writeFileSync(planFile, '{}', 'utf8');

  const collectSessionSnapshotImpl = () => buildRawDmuxSnapshot();
  const adapter = dmuxTmux.createDmuxTmuxAdapter({ recordingDir, collectSessionSnapshotImpl, loadStateStoreImpl: () => null });
  const snapshot = adapter.open('plan.json', { cwd }).getSnapshot();

  assert.equal(snapshot.session.sourceTarget.type, 'plan');
  assert.equal(snapshot.session.sourceTarget.value, path.resolve(cwd, 'plan.json'));
});

// ===========================================================================
// orchestration-session.js
// ===========================================================================

test('normalizeText (stripCodeTicks) strips wrapping backticks and trims', () => {
  assert.equal(orchestration.normalizeText('`value`'), 'value');
  assert.equal(orchestration.normalizeText('  plain  '), 'plain');
  assert.equal(orchestration.normalizeText(123), 123); // non-string passthrough
});

test('parseWorkerStatus parses a status.md body into structured fields', () => {
  const content = [
    '# Status',
    '- State: `running`',
    '- Updated: 2026-06-01T00:00:00Z',
    '- Branch: feat/ui',
    '- Worktree: /tmp/wt',
    '- Task File: task.md',
    '- Handoff File: handoff.md'
  ].join('\n');

  const status = orchestration.parseWorkerStatus(content);
  assert.equal(status.state, 'running');
  assert.equal(status.updated, '2026-06-01T00:00:00Z');
  assert.equal(status.branch, 'feat/ui');
  assert.equal(status.worktree, '/tmp/wt');
  assert.equal(status.taskFile, 'task.md');
  assert.equal(status.handoffFile, 'handoff.md');
});

test('parseWorkerStatus returns nulled fields on empty input', () => {
  const status = orchestration.parseWorkerStatus('');
  assert.equal(status.state, null);
  assert.equal(status.branch, null);
});

test('parseWorkerTask extracts the Objective section and seeded overlay bullets', () => {
  const content = [
    '## Objective',
    'Build the dashboard grid',
    '',
    '## Seeded Local Overlays',
    '- `overlay-a.md`',
    '- overlay-b.md'
  ].join('\n');

  const task = orchestration.parseWorkerTask(content);
  assert.equal(task.objective, 'Build the dashboard grid');
  assert.deepEqual(task.seedPaths, ['overlay-a.md', 'overlay-b.md']);
});

test('parseWorkerHandoff extracts Summary / Validation / Remaining Risks bullets', () => {
  const content = [
    '## Summary',
    '- shipped feature',
    '',
    '## Validation',
    '- ran tests',
    '',
    '## Remaining Risks',
    '- perf under load'
  ].join('\n');

  const handoff = orchestration.parseWorkerHandoff(content);
  assert.deepEqual(handoff.summary, ['shipped feature']);
  assert.deepEqual(handoff.validation, ['ran tests']);
  assert.deepEqual(handoff.remainingRisks, ['perf under load']);
});

test('loadWorkerSnapshots reads worker dirs with status/task/handoff files', () => {
  // Arrange: synthetic coordination dir with one worker
  const coordDir = makeTmpDir('coord');
  const workerDir = path.join(coordDir, 'backend');
  fs.mkdirSync(workerDir, { recursive: true });
  fs.writeFileSync(path.join(workerDir, 'status.md'), '- State: `running`\n- Branch: feat/be', 'utf8');
  fs.writeFileSync(path.join(workerDir, 'task.md'), '## Objective\nDo backend work', 'utf8');
  fs.writeFileSync(
    path.join(workerDir, 'handoff.md'),
    '## Summary\n- be summary\n\n## Validation\n- be validated',
    'utf8'
  );
  // a non-worker dir with no recognized files must be ignored
  fs.mkdirSync(path.join(coordDir, 'noise'), { recursive: true });

  // Act
  const workers = orchestration.loadWorkerSnapshots(coordDir);

  // Assert
  assert.equal(workers.length, 1);
  assert.equal(workers[0].workerSlug, 'backend');
  assert.equal(workers[0].status.state, 'running');
  assert.equal(workers[0].task.objective, 'Do backend work');
  assert.deepEqual(workers[0].handoff.summary, ['be summary']);
});

test('loadWorkerSnapshots returns empty for a missing coordination dir', () => {
  const missing = path.join(makeTmpDir('coord-missing'), 'nope');
  assert.deepEqual(orchestration.loadWorkerSnapshots(missing), []);
});

test('buildSessionSnapshot joins workers with their matching tmux panes', () => {
  const coordDir = makeTmpDir('coord-build');
  const workerDir = path.join(coordDir, 'frontend');
  fs.mkdirSync(workerDir, { recursive: true });
  fs.writeFileSync(path.join(workerDir, 'status.md'), '- State: `running`', 'utf8');

  const panes = [
    { title: 'frontend', currentCommand: 'node', active: true, dead: false, pid: 7 },
    { title: 'orphan-pane', currentCommand: 'bash', active: false, dead: false, pid: 8 }
  ];

  const snapshot = orchestration.buildSessionSnapshot({ sessionName: 's1', coordinationDir: coordDir, panes });

  assert.equal(snapshot.sessionName, 's1');
  assert.equal(snapshot.sessionActive, true);
  assert.equal(snapshot.paneCount, 2);
  assert.equal(snapshot.workerCount, 1);
  assert.deepEqual(snapshot.workerStates, { running: 1 });
  assert.equal(snapshot.workers[0].pane.pid, 7);
});

test('resolveSnapshotTarget: plan file vs bare session name', () => {
  const cwd = makeTmpDir('resolve');
  const planFile = path.join(cwd, 'plan.json');
  fs.writeFileSync(
    planFile,
    JSON.stringify({ sessionName: 'planned', repoRoot: cwd, coordinationRoot: path.join(cwd, '.orch') }),
    'utf8'
  );

  const planTarget = orchestration.resolveSnapshotTarget('plan.json', cwd);
  assert.equal(planTarget.targetType, 'plan');
  assert.equal(planTarget.sessionName, 'planned');
  assert.equal(planTarget.coordinationDir, path.join(cwd, '.orch', 'planned'));

  const nameTarget = orchestration.resolveSnapshotTarget('just-a-name', cwd);
  assert.equal(nameTarget.targetType, 'session');
  assert.equal(nameTarget.sessionName, 'just-a-name');
  assert.equal(nameTarget.coordinationDir, path.join(cwd, '.claude', 'orchestration', 'just-a-name'));
});

test('listTmuxPanes returns [] when tmux binary is missing (ENOENT) via injected spawnSync', () => {
  const spawnSyncImpl = () => ({ error: Object.assign(new Error('not found'), { code: 'ENOENT' }) });
  const panes = orchestration.listTmuxPanes('any-session', { spawnSyncImpl });
  assert.deepEqual(panes, []);
});

test('listTmuxPanes parses tab-delimited pane rows from injected spawnSync stdout', () => {
  const row = ['%1', '0', '2', 'frontend', 'node', '/tmp', '1', '0', '999'].join('\t');
  const spawnSyncImpl = () => ({ status: 0, stdout: `${row}\n` });
  const panes = orchestration.listTmuxPanes('s', { spawnSyncImpl });
  assert.equal(panes.length, 1);
  assert.equal(panes[0].paneId, '%1');
  assert.equal(panes[0].title, 'frontend');
  assert.equal(panes[0].active, true);
  assert.equal(panes[0].dead, false);
  assert.equal(panes[0].pid, 999);
});

test('collectSessionSnapshot composes resolve + (tmux-less) panes + build for a bare session', () => {
  const cwd = makeTmpDir('collect');
  const coordDir = path.join(cwd, '.claude', 'orchestration', 'live');
  const workerDir = path.join(coordDir, 'svc');
  fs.mkdirSync(workerDir, { recursive: true });
  fs.writeFileSync(path.join(workerDir, 'status.md'), '- State: `idle`', 'utf8');

  // tmux is almost certainly absent in CI; listTmuxPanes -> [] on ENOENT, so this is deterministic.
  const snapshot = orchestration.collectSessionSnapshot('live', cwd);
  assert.equal(snapshot.sessionName, 'live');
  assert.equal(snapshot.targetType, 'session');
  assert.equal(snapshot.repoRoot, cwd);
  assert.equal(snapshot.workerCount, 1);
  assert.equal(snapshot.workers[0].workerSlug, 'svc');
});

// ===========================================================================
// observer-sessions.js
// ===========================================================================

test('resolveProjectContext returns a project context using CLAUDE_PROJECT_DIR', () => {
  const saved = snapshotEnv();
  try {
    redirectHome('obs-home');
    const projectRoot = makeTmpDir('obs-project');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;

    const context = observerSessions.resolveProjectContext(projectRoot);
    assert.equal(context.isGlobal, false);
    assert.equal(context.projectRoot, path.resolve(projectRoot));
    assert.ok(typeof context.projectId === 'string' && context.projectId.length > 0);
    assert.ok(fs.existsSync(context.projectDir));
  } finally {
    restoreEnv(saved);
  }
});

test('resolveSessionId sanitizes / defaults the raw session id', () => {
  assert.equal(observerSessions.resolveSessionId('My Session 01'), 'My-Session-01');
  assert.equal(observerSessions.resolveSessionId(''), '');
});

test('writeSessionLease / listSessionLeases / removeSessionLease round-trip', () => {
  const saved = snapshotEnv();
  try {
    redirectHome('obs-lease-home');
    const projectRoot = makeTmpDir('obs-lease-project');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    const context = observerSessions.resolveProjectContext(projectRoot);

    // Act: write a lease for an explicit session id
    const leaseFile = observerSessions.writeSessionLease(context, 'sess-XYZ', { note: 'hello' });
    assert.ok(leaseFile && fs.existsSync(leaseFile));

    const payload = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
    assert.equal(payload.sessionId, 'sess-XYZ');
    assert.equal(payload.note, 'hello');
    assert.equal(typeof payload.pid, 'number');

    const leases = observerSessions.listSessionLeases(context);
    assert.equal(leases.length, 1);
    assert.equal(path.basename(leases[0]), 'sess-XYZ.json');

    // Remove
    assert.equal(observerSessions.removeSessionLease(context, 'sess-XYZ'), true);
    assert.equal(observerSessions.listSessionLeases(context).length, 0);
    // removing a non-existent lease deletes nothing but returns true (rmSync force)
    assert.equal(observerSessions.removeSessionLease(context, 'sess-XYZ'), true);
  } finally {
    restoreEnv(saved);
  }
});

test('writeSessionLease returns empty string when no session id is resolvable', () => {
  const saved = snapshotEnv();
  try {
    redirectHome('obs-nolease-home');
    const projectRoot = makeTmpDir('obs-nolease-project');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    const context = observerSessions.resolveProjectContext(projectRoot);
    // empty id -> no lease file
    assert.equal(observerSessions.writeSessionLease(context, ''), '');
  } finally {
    restoreEnv(saved);
  }
});

test('listSessionLeases returns [] for a context with no lease dir', () => {
  const saved = snapshotEnv();
  try {
    redirectHome('obs-empty-home');
    const projectRoot = makeTmpDir('obs-empty-project');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    const context = observerSessions.resolveProjectContext(projectRoot);
    assert.deepEqual(observerSessions.listSessionLeases(context), []);
  } finally {
    restoreEnv(saved);
  }
});

test('getObserverActivityFile / getObserverPidFile / getSessionLeaseDir resolve under projectDir', () => {
  const saved = snapshotEnv();
  try {
    redirectHome('obs-paths-home');
    const projectRoot = makeTmpDir('obs-paths-project');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    const context = observerSessions.resolveProjectContext(projectRoot);

    assert.equal(observerSessions.getObserverActivityFile(context), path.join(context.projectDir, '.observer-last-activity'));
    assert.equal(observerSessions.getObserverPidFile(context), path.join(context.projectDir, '.observer.pid'));
    assert.equal(observerSessions.getSessionLeaseDir(context), path.join(context.projectDir, '.observer-sessions'));
  } finally {
    restoreEnv(saved);
  }
});

test('stopObserverForContext returns false when no pid file exists', () => {
  const saved = snapshotEnv();
  try {
    redirectHome('obs-stop-home');
    const projectRoot = makeTmpDir('obs-stop-project');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    const context = observerSessions.resolveProjectContext(projectRoot);
    assert.equal(observerSessions.stopObserverForContext(context), false);
  } finally {
    restoreEnv(saved);
  }
});

test('stopObserverForContext cleans up an invalid (pid 0/1/non-numeric) pid file and returns false', () => {
  const saved = snapshotEnv();
  try {
    redirectHome('obs-stop2-home');
    const projectRoot = makeTmpDir('obs-stop2-project');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    const context = observerSessions.resolveProjectContext(projectRoot);

    const pidFile = observerSessions.getObserverPidFile(context);
    fs.writeFileSync(pidFile, '0\n', 'utf8'); // pid 0 is rejected

    assert.equal(observerSessions.stopObserverForContext(context), false);
    assert.equal(fs.existsSync(pidFile), false); // cleaned up
  } finally {
    restoreEnv(saved);
  }
});
