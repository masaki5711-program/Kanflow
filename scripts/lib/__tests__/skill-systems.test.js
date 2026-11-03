'use strict';

// Unit tests for the skill-evolution and skill-improvement library subsystems.
// Built-ins only. All filesystem state is isolated under os.tmpdir() and cleaned
// up in test.after. Modules that read ~/.claude or a runs file are redirected
// via the option each module documents in its source (homeDir / runsFilePath /
// repoRoot / projectRoot / observationsPath).

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dashboard = require('../skill-evolution/dashboard');
const versioning = require('../skill-evolution/versioning');
const provenance = require('../skill-evolution/provenance');
const evolutionIndex = require('../skill-evolution/index');
const evolutionHealth = require('../skill-evolution/health');

const evaluate = require('../skill-improvement/evaluate');
const amendify = require('../skill-improvement/amendify');
const observations = require('../skill-improvement/observations');
const improvementHealth = require('../skill-improvement/health');

// --- shared temp-dir bookkeeping ------------------------------------------

const tmpDirs = [];

function makeTmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

function writeSkill(skillDir, body = '# Skill\n\noriginal\n') {
  fs.mkdirSync(skillDir, { recursive: true });
  const skillFile = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillFile, body, 'utf8');
  return skillFile;
}

test.after(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

// ==========================================================================
// skill-evolution/provenance.js
// ==========================================================================

test('provenance: classifySkillPath maps roots to their skill types', () => {
  // Arrange
  const repoRoot = makeTmpDir('prov-repo');
  const homeDir = makeTmpDir('prov-home');
  const opts = { repoRoot, homeDir };
  const curatedDir = path.join(repoRoot, 'skills', 'alpha');
  const learnedDir = path.join(homeDir, '.claude', 'skills', 'learned', 'beta');
  const importedDir = path.join(homeDir, '.claude', 'skills', 'imported', 'gamma');
  const outsideDir = makeTmpDir('prov-outside');

  // Act + Assert
  assert.equal(provenance.classifySkillPath(curatedDir, opts), provenance.SKILL_TYPES.CURATED);
  assert.equal(provenance.classifySkillPath(learnedDir, opts), provenance.SKILL_TYPES.LEARNED);
  assert.equal(provenance.classifySkillPath(importedDir, opts), provenance.SKILL_TYPES.IMPORTED);
  assert.equal(provenance.classifySkillPath(outsideDir, opts), provenance.SKILL_TYPES.UNKNOWN);
});

test('provenance: requiresProvenance is true only for learned/imported', () => {
  // Arrange
  const repoRoot = makeTmpDir('prov-repo2');
  const homeDir = makeTmpDir('prov-home2');
  const opts = { repoRoot, homeDir };

  // Act + Assert
  assert.equal(provenance.requiresProvenance(path.join(repoRoot, 'skills', 'a'), opts), false);
  assert.equal(
    provenance.requiresProvenance(path.join(homeDir, '.claude', 'skills', 'learned', 'b'), opts),
    true,
  );
});

test('provenance: validateProvenance flags missing/invalid fields', () => {
  // Arrange
  const good = { source: 'session', created_at: '2026-01-01T00:00:00Z', confidence: 0.5, author: 'tester' };
  const bad = { source: '', created_at: 'not-a-date', confidence: 2, author: '' };

  // Act
  const okResult = provenance.validateProvenance(good);
  const badResult = provenance.validateProvenance(bad);
  const nonObject = provenance.validateProvenance(null);

  // Assert
  assert.equal(okResult.valid, true);
  assert.deepEqual(okResult.errors, []);
  assert.equal(badResult.valid, false);
  assert.ok(badResult.errors.length >= 4);
  assert.equal(nonObject.valid, false);
});

test('provenance: write then read round-trips a learned-skill record', () => {
  // Arrange
  const homeDir = makeTmpDir('prov-home3');
  const repoRoot = makeTmpDir('prov-repo3');
  const skillDir = path.join(homeDir, '.claude', 'skills', 'learned', 'router');
  fs.mkdirSync(skillDir, { recursive: true });
  const record = { source: 'session', created_at: '2026-02-02T10:00:00Z', confidence: 0.9, author: 'fuji' };
  const opts = { repoRoot, homeDir };

  // Act
  const writeResult = provenance.writeProvenance(skillDir, record, opts);
  const readBack = provenance.readProvenance(skillDir, opts);

  // Assert
  assert.equal(fs.existsSync(writeResult.path), true);
  assert.deepEqual(readBack, record);
});

test('provenance: writeProvenance rejects curated skills; readProvenance returns null when optional & absent', () => {
  // Arrange
  const homeDir = makeTmpDir('prov-home4');
  const repoRoot = makeTmpDir('prov-repo4');
  const curatedDir = path.join(repoRoot, 'skills', 'curated-x');
  fs.mkdirSync(curatedDir, { recursive: true });
  const record = { source: 's', created_at: '2026-02-02T10:00:00Z', confidence: 0.5, author: 'a' };
  const opts = { repoRoot, homeDir };

  // Act + Assert
  assert.throws(() => provenance.writeProvenance(curatedDir, record, opts), /only required for learned or imported/);
  assert.equal(provenance.readProvenance(curatedDir, opts), null);
  assert.throws(() => provenance.readProvenance(curatedDir, { ...opts, required: true }), /Missing provenance/);
});

// ==========================================================================
// skill-evolution/versioning.js
// ==========================================================================

test('versioning: createVersion snapshots SKILL.md and listVersions returns it', () => {
  // Arrange
  const skillDir = makeTmpDir('ver-skill');
  writeSkill(skillDir, '# v1 body\n');

  // Act
  const created = versioning.createVersion(skillDir, { reason: 'first', author: 'fuji' });
  const versions = versioning.listVersions(skillDir);

  // Assert
  assert.equal(created.version, 1);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].version, 1);
  assert.equal(fs.readFileSync(created.path, 'utf8'), '# v1 body\n');
});

test('versioning: getCurrentVersion increments and evolution log records snapshots', () => {
  // Arrange
  const skillDir = makeTmpDir('ver-skill2');
  writeSkill(skillDir, 'a\n');

  // Act
  versioning.createVersion(skillDir, { reason: 'one' });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'b\n', 'utf8');
  versioning.createVersion(skillDir, { reason: 'two' });
  const current = versioning.getCurrentVersion(skillDir);
  const log = versioning.getEvolutionLog(skillDir, 'amendments');

  // Assert
  assert.equal(current, 2);
  assert.equal(log.filter(e => e.event === 'snapshot').length, 2);
});

test('versioning: rollbackTo restores prior content and logs a rollback', () => {
  // Arrange
  const skillDir = makeTmpDir('ver-skill3');
  const skillFile = writeSkill(skillDir, 'gen1\n');
  versioning.createVersion(skillDir, { reason: 'g1' }); // v1 = gen1
  fs.writeFileSync(skillFile, 'gen2\n', 'utf8');
  versioning.createVersion(skillDir, { reason: 'g2' }); // v2 = gen2

  // Act
  const rolled = versioning.rollbackTo(skillDir, 1, { reason: 'revert' });
  const log = versioning.getEvolutionLog(skillDir, 'amendments');

  // Assert
  assert.equal(fs.readFileSync(skillFile, 'utf8'), 'gen1\n');
  assert.equal(rolled.version, 3); // rollback creates a new snapshot
  assert.equal(log.filter(e => e.event === 'rollback').length, 1);
});

test('versioning: appendEvolutionRecord round-trips through getEvolutionLog; bad log type throws', () => {
  // Arrange
  const skillDir = makeTmpDir('ver-skill4');
  writeSkill(skillDir);
  const record = { event: 'observation', note: 'hello' };

  // Act
  versioning.appendEvolutionRecord(skillDir, 'observations', record);
  const log = versioning.getEvolutionLog(skillDir, 'observations');

  // Assert
  assert.equal(log.length, 1);
  assert.equal(log[0].note, 'hello');
  assert.throws(() => versioning.getEvolutionLogPath(skillDir, 'bogus'), /Unknown evolution log type/);
});

test('versioning: rollbackTo rejects invalid/missing target versions', () => {
  // Arrange
  const skillDir = makeTmpDir('ver-skill5');
  writeSkill(skillDir);
  versioning.createVersion(skillDir, { reason: 'init' });

  // Act + Assert
  assert.throws(() => versioning.rollbackTo(skillDir, 0), /Invalid target version/);
  assert.throws(() => versioning.rollbackTo(skillDir, 99), /Version not found/);
});

// ==========================================================================
// skill-evolution/tracker.js (exercised through health + dashboard fixtures)
// ==========================================================================

function buildExecutionFixture(homeDir, records) {
  // Use the tracker via the module re-exported from the evolution index to keep
  // coverage on tracker; redirect via runsFilePath under tmp.
  const runsFilePath = path.join(homeDir, 'runs.jsonl');
  for (const rec of records) {
    evolutionIndex.tracker.recordSkillExecution(rec, { runsFilePath });
  }
  return runsFilePath;
}

test('tracker: recordSkillExecution + readSkillExecutionRecords round-trip via runsFilePath', () => {
  // Arrange
  const homeDir = makeTmpDir('trk-home');
  const runsFilePath = path.join(homeDir, 'runs.jsonl');
  const input = {
    skill_id: 'router',
    skill_version: 'v1',
    task_description: 'route a request',
    outcome: 'success',
    recorded_at: '2026-06-01T00:00:00Z',
  };

  // Act
  const writeResult = evolutionIndex.tracker.recordSkillExecution(input, { runsFilePath });
  const read = evolutionIndex.tracker.readSkillExecutionRecords({ runsFilePath });

  // Assert
  assert.equal(writeResult.storage, 'jsonl');
  assert.equal(read.length, 1);
  assert.equal(read[0].skill_id, 'router');
});

test('tracker: normalizeExecutionRecord validates required fields and outcome enum', () => {
  // Arrange + Act + Assert
  assert.throws(() => evolutionIndex.tracker.normalizeExecutionRecord({}), /skill_id is required/);
  assert.throws(
    () => evolutionIndex.tracker.normalizeExecutionRecord({
      skill_id: 's', skill_version: 'v1', task_description: 't', outcome: 'nope',
    }),
    /outcome must be one of/,
  );
});

// ==========================================================================
// skill-evolution/health.js
// ==========================================================================

test('health(evolution): discoverSkills finds skills across curated/learned roots', () => {
  // Arrange
  const repoRoot = makeTmpDir('eh-repo');
  const homeDir = makeTmpDir('eh-home');
  writeSkill(path.join(repoRoot, 'skills', 'curated-a'));
  writeSkill(path.join(homeDir, '.claude', 'skills', 'learned', 'learned-b'));

  // Act
  const map = evolutionHealth.discoverSkills({ repoRoot, homeDir });

  // Assert
  assert.equal(map.has('curated-a'), true);
  assert.equal(map.has('learned-b'), true);
  assert.equal(map.get('curated-a').skill_type, provenance.SKILL_TYPES.CURATED);
});

test('health(evolution): collectSkillHealth computes success rates and trend', () => {
  // Arrange
  const repoRoot = makeTmpDir('eh-repo2');
  const homeDir = makeTmpDir('eh-home2');
  const skillDir = path.join(repoRoot, 'skills', 'svc');
  writeSkill(skillDir);
  versioning.createVersion(skillDir, { reason: 'init', timestamp: '2026-06-01T00:00:00Z' });
  const now = '2026-06-10T00:00:00Z';
  const runsFilePath = buildExecutionFixture(homeDir, [
    { skill_id: 'svc', skill_version: 'v1', task_description: 't', outcome: 'success', recorded_at: '2026-06-09T00:00:00Z' },
    { skill_id: 'svc', skill_version: 'v1', task_description: 't', outcome: 'failure', recorded_at: '2026-06-08T00:00:00Z' },
  ]);

  // Act
  const report = evolutionHealth.collectSkillHealth({ repoRoot, homeDir, runsFilePath, now });
  const summary = evolutionHealth.summarizeHealthReport(report);
  const svc = report.skills.find(s => s.skill_id === 'svc');

  // Assert
  assert.equal(svc.success_rate_7d, 0.5);
  assert.equal(svc.run_count_7d, 2);
  assert.equal(svc.current_version, 'v1');
  assert.equal(summary.total_skills, report.skills.length);
});

test('health(evolution): calculateSuccessRate and filterRecordsWithinDays edge cases', () => {
  // Arrange
  const nowMs = Date.parse('2026-06-10T00:00:00Z');
  const records = [
    { outcome: 'success', recorded_at: '2026-06-09T00:00:00Z' },
    { outcome: 'failure', recorded_at: '2026-05-01T00:00:00Z' }, // older than 7d
  ];

  // Act
  const emptyRate = evolutionHealth.calculateSuccessRate([]);
  const within7 = evolutionHealth.filterRecordsWithinDays(records, nowMs, 7);

  // Assert
  assert.equal(emptyRate, null);
  assert.equal(within7.length, 1);
  assert.equal(evolutionHealth.calculateSuccessRate(within7), 1);
});

test('health(evolution): formatHealthReport renders json and text; collectSkillHealth rejects bad now', () => {
  // Arrange
  const repoRoot = makeTmpDir('eh-repo3');
  const homeDir = makeTmpDir('eh-home3');
  const report = evolutionHealth.collectSkillHealth({ repoRoot, homeDir, now: '2026-06-10T00:00:00Z' });

  // Act
  const json = evolutionHealth.formatHealthReport(report, { json: true });
  const text = evolutionHealth.formatHealthReport(report);

  // Assert
  assert.match(json, /"skills"/);
  assert.match(text, /ECC skill health/);
  assert.throws(() => evolutionHealth.collectSkillHealth({ now: 'invalid-date' }), /Invalid now timestamp/);
});

// ==========================================================================
// skill-evolution/dashboard.js
// ==========================================================================

test('dashboard: sparkline maps values to blocks and handles nulls/empty', () => {
  // Arrange + Act
  const spark = dashboard.sparkline([0, 0.5, 1]);
  const withNull = dashboard.sparkline([null]);

  // Assert
  assert.equal(spark.length, 3);
  assert.equal(dashboard.sparkline([]), '');
  assert.equal(withNull, '░'); // EMPTY_BLOCK
});

test('dashboard: horizontalBar fills proportionally and guards zero max', () => {
  // Arrange + Act
  const full = dashboard.horizontalBar(10, 10, 4);
  const half = dashboard.horizontalBar(5, 10, 4);
  const guarded = dashboard.horizontalBar(5, 0, 4);

  // Assert
  assert.equal(full, '████');
  assert.equal(half.length, 4);
  assert.equal(guarded.length, 4); // all empty blocks
});

test('dashboard: panelBox and bucketByDay produce expected structure', () => {
  // Arrange
  const box = dashboard.panelBox('Title', ['line one'], 20);
  const nowMs = Date.parse('2026-06-10T00:00:00Z');
  const records = [{ recorded_at: '2026-06-09T12:00:00Z', outcome: 'success' }];

  // Act
  const buckets = dashboard.bucketByDay(records, nowMs, 3);

  // Assert
  assert.match(box, /Title/);
  assert.equal(buckets.length, 3);
  assert.equal(buckets.some(b => b.runs === 1), true);
});

test('dashboard: renderSuccessRatePanel and renderFailureClusterPanel handle empty + populated data', () => {
  // Arrange
  const records = [
    { skill_id: 'svc', outcome: 'failure', failure_reason: 'Timeout', recorded_at: '2026-06-09T00:00:00Z' },
    { skill_id: 'svc', outcome: 'success', recorded_at: '2026-06-09T00:00:00Z' },
  ];
  const skills = [{ skill_id: 'svc' }];
  const opts = { now: '2026-06-10T00:00:00Z' };

  // Act
  const emptyPanel = dashboard.renderSuccessRatePanel([], [], opts);
  const ratePanel = dashboard.renderSuccessRatePanel(records, skills, opts);
  const failPanel = dashboard.renderFailureClusterPanel(records, opts);

  // Assert
  assert.match(emptyPanel.text, /No skill execution data/);
  assert.equal(ratePanel.data.skills.length, 1);
  assert.equal(failPanel.data.total_failures, 1);
  assert.equal(failPanel.data.clusters[0].pattern, 'timeout');
});

test('dashboard: renderAmendmentPanel and renderVersionTimelinePanel read skill dirs', () => {
  // Arrange
  const skillDir = makeTmpDir('dash-skill');
  writeSkill(skillDir);
  versioning.createVersion(skillDir, { reason: 'init' });
  versioning.appendEvolutionRecord(skillDir, 'amendments', {
    event: 'proposal', status: 'pending', created_at: '2026-06-09T00:00:00Z',
  });
  const skillsById = new Map([['svc', { skill_id: 'svc', skill_dir: skillDir }]]);

  // Act
  const amendPanel = dashboard.renderAmendmentPanel(skillsById);
  const versionPanel = dashboard.renderVersionTimelinePanel(skillsById);

  // Assert
  assert.equal(amendPanel.data.total, 1);
  assert.equal(versionPanel.data.skills[0].skill_id, 'svc');
});

test('dashboard: renderDashboard renders all panels and rejects unknown panel/bad now', () => {
  // Arrange
  const repoRoot = makeTmpDir('dash-repo');
  const homeDir = makeTmpDir('dash-home');
  const skillDir = path.join(repoRoot, 'skills', 'svc');
  writeSkill(skillDir);
  versioning.createVersion(skillDir, { reason: 'init' });
  const runsFilePath = buildExecutionFixture(homeDir, [
    { skill_id: 'svc', skill_version: 'v1', task_description: 't', outcome: 'success', recorded_at: '2026-06-09T00:00:00Z' },
  ]);
  const opts = { repoRoot, homeDir, runsFilePath, now: '2026-06-10T00:00:00Z' };

  // Act
  const all = dashboard.renderDashboard(opts);
  const single = dashboard.renderDashboard({ ...opts, panel: 'failures' });

  // Assert
  assert.match(all.text, /ECC Skill Health Dashboard/);
  assert.ok(all.data.panels['success-rate']);
  assert.ok(single.data.panels.failures);
  assert.throws(() => dashboard.renderDashboard({ ...opts, panel: 'nope' }), /Unknown panel/);
  assert.throws(() => dashboard.renderDashboard({ ...opts, now: 'bad' }), /Invalid now timestamp/);
});

// ==========================================================================
// skill-evolution/index.js
// ==========================================================================

test('index(evolution): re-exports submodules and flattened functions', () => {
  // Assert
  assert.equal(typeof evolutionIndex.renderDashboard, 'function');
  assert.equal(typeof evolutionIndex.createVersion, 'function');
  assert.equal(evolutionIndex.provenance, provenance);
  assert.equal(evolutionIndex.dashboard, dashboard);
  assert.equal(evolutionIndex.versioning, versioning);
});

// ==========================================================================
// skill-improvement/observations.js
// ==========================================================================

test('observations: createSkillObservation normalizes fields and defaults variant', () => {
  // Arrange
  const input = { task: '  ship it  ', skill: { id: 'router', path: 'skills/router/SKILL.md' }, success: true };

  // Act
  const obs = observations.createSkillObservation(input);

  // Assert
  assert.equal(obs.schemaVersion, observations.OBSERVATION_SCHEMA_VERSION);
  assert.equal(obs.task, 'ship it');
  assert.equal(obs.skill.id, 'router');
  assert.equal(obs.outcome.status, 'success');
  assert.equal(obs.run.variant, 'baseline');
});

test('observations: createSkillObservation throws on missing task/skill id', () => {
  // Arrange + Act + Assert
  assert.throws(() => observations.createSkillObservation({ skill: { id: 'x' } }), /task must be a non-empty string/);
  assert.throws(() => observations.createSkillObservation({ task: 't', skill: {} }), /skill.id must be a non-empty string/);
});

test('observations: append then read round-trips through projectRoot telemetry path', () => {
  // Arrange
  const projectRoot = makeTmpDir('obs-root');
  const obs1 = observations.createSkillObservation({ task: 't1', skill: { id: 's' }, success: true });
  const obs2 = observations.createSkillObservation({
    task: 't2', skill: { id: 's' }, success: false, error: 'boom', variant: 'amended',
  });

  // Act
  observations.appendSkillObservation(obs1, { projectRoot });
  observations.appendSkillObservation(obs2, { projectRoot });
  const read = observations.readSkillObservations({ projectRoot });

  // Assert
  assert.equal(read.length, 2);
  assert.equal(read[1].outcome.error, 'boom');
  assert.equal(read[1].run.variant, 'amended');
});

test('observations: readSkillObservations returns [] for a missing file', () => {
  // Arrange
  const projectRoot = makeTmpDir('obs-empty');

  // Act
  const read = observations.readSkillObservations({ projectRoot });

  // Assert
  assert.deepEqual(read, []);
});

// ==========================================================================
// skill-improvement/health.js
// ==========================================================================

function obs(id, success, extra = {}) {
  return observations.createSkillObservation({
    task: extra.task || 'do work',
    skill: { id, path: extra.path || `skills/${id}/SKILL.md` },
    success,
    error: extra.error || null,
    feedback: extra.feedback || null,
    variant: extra.variant,
  });
}

test('health(improvement): buildSkillHealthReport ranks failures and derives status', () => {
  // Arrange
  const records = [
    obs('router', false, { error: 'timeout', task: 'route' }),
    obs('router', false, { error: 'timeout', task: 'route' }),
    obs('router', true),
    obs('cache', true),
  ];

  // Act
  const report = improvementHealth.buildSkillHealthReport(records);
  const router = report.skills.find(s => s.skill.id === 'router');

  // Assert
  assert.equal(report.schemaVersion, improvementHealth.HEALTH_SCHEMA_VERSION);
  assert.equal(router.failures, 2);
  assert.equal(router.status, 'failing'); // default minFailureCount=2
  assert.equal(router.recurringErrors[0].error, 'timeout');
  assert.equal(router.recurringErrors[0].count, 2);
});

test('health(improvement): skillId filter and watch status (single failure)', () => {
  // Arrange
  const records = [
    obs('router', false, { error: 'e1' }),
    obs('router', true),
    obs('other', false),
  ];

  // Act
  const report = improvementHealth.buildSkillHealthReport(records, { skillId: 'router' });

  // Assert
  assert.equal(report.skillCount, 1);
  assert.equal(report.skills[0].status, 'watch');
  assert.equal(report.skills[0].variants.baseline.runs, 2);
});

// ==========================================================================
// skill-improvement/evaluate.js
// ==========================================================================

test('evaluate: buildSkillEvaluationScaffold recommends insufficient-data below the gate', () => {
  // Arrange
  const records = [obs('router', true)];

  // Act
  const scaffold = evaluate.buildSkillEvaluationScaffold('router', records);

  // Assert
  assert.equal(scaffold.schemaVersion, evaluate.EVALUATION_SCHEMA_VERSION);
  assert.equal(scaffold.recommendation, 'insufficient-data');
  assert.equal(scaffold.baseline.runs, 1);
});

test('evaluate: promotes amendment when amended success rate beats baseline', () => {
  // Arrange — baseline failing, amended succeeding, both meeting the 2-run gate
  const records = [
    obs('router', false),
    obs('router', false),
    obs('router', true, { variant: 'amended' }),
    obs('router', true, { variant: 'amended' }),
  ];

  // Act
  const scaffold = evaluate.buildSkillEvaluationScaffold('router', records, { minimumRunsPerVariant: 2 });

  // Assert
  assert.equal(scaffold.baseline.runs, 2);
  assert.equal(scaffold.amended.runs, 2);
  assert.ok(scaffold.delta.successRate > 0);
  assert.equal(scaffold.recommendation, 'promote-amendment');
});

test('evaluate: keeps baseline when amended is not better', () => {
  // Arrange
  const records = [
    obs('router', true),
    obs('router', true),
    obs('router', false, { variant: 'amended' }),
    obs('router', false, { variant: 'amended' }),
  ];

  // Act
  const scaffold = evaluate.buildSkillEvaluationScaffold('router', records, { minimumRunsPerVariant: 2 });

  // Assert
  assert.equal(scaffold.recommendation, 'keep-baseline');
});

// ==========================================================================
// skill-improvement/amendify.js
// ==========================================================================

test('amendify: proposeSkillAmendment returns insufficient-evidence with no failures', () => {
  // Arrange
  const records = [obs('router', true)];

  // Act
  const proposal = amendify.proposeSkillAmendment('router', records);

  // Assert
  assert.equal(proposal.schemaVersion, amendify.AMENDMENT_SCHEMA_VERSION);
  assert.equal(proposal.status, 'insufficient-evidence');
  assert.equal(proposal.patch, null);
});

test('amendify: proposeSkillAmendment builds an additive patch from recurring failures', () => {
  // Arrange
  const records = [
    obs('router', false, { error: 'timeout', task: 'route a request', feedback: 'too slow' }),
    obs('router', false, { error: 'timeout', task: 'route a request', feedback: 'too slow' }),
    obs('router', true),
  ];

  // Act
  const proposal = amendify.proposeSkillAmendment('router', records);

  // Assert
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.skill.id, 'router');
  assert.match(proposal.patch.preview, /timeout/);
  assert.match(proposal.patch.preview, /route a request/);
  assert.match(proposal.patch.preview, /too slow/);
  assert.equal(proposal.evidence.failures, 2);
  assert.ok(proposal.proposalId.startsWith('amend-router-'));
});
