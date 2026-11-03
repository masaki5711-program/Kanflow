'use strict';

/**
 * post-skill-run-tracker.js — the OBSERVE wiring for skill-runs.jsonl.
 *
 * All tests run the hook in-process via its run() export and point the
 * tracker at a temp JSONL file through ECC_SKILL_RUNS_PATH.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hook = require('../post-skill-run-tracker');

function tempRunsPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-skill-runs-'));
  return path.join(dir, 'skill-runs.jsonl');
}

function withRunsPath(runsPath, fn) {
  const prev = process.env.ECC_SKILL_RUNS_PATH;
  process.env.ECC_SKILL_RUNS_PATH = runsPath;
  try {
    return fn();
  } finally {
    if (typeof prev === 'undefined') delete process.env.ECC_SKILL_RUNS_PATH;
    else process.env.ECC_SKILL_RUNS_PATH = prev;
  }
}

function readRecords(runsPath) {
  if (!fs.existsSync(runsPath)) return [];
  return fs.readFileSync(runsPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
}

test('skill-run-tracker: records a Skill invocation as success', () => {
  const runsPath = tempRunsPath();
  const payload = JSON.stringify({
    tool_name: 'Skill',
    tool_input: { skill: 'tdd-workflow', args: 'add regression test' },
    tool_response: 'Launching skill: tdd-workflow',
  });

  const out = withRunsPath(runsPath, () => hook.run(payload));

  assert.strictEqual(out, payload, 'hook must pass the payload through unchanged');
  const records = readRecords(runsPath);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].skill_id, 'tdd-workflow');
  assert.strictEqual(records[0].outcome, 'success');
  assert.match(records[0].task_description, /^\/tdd-workflow add regression test/);
  assert.ok(records[0].recorded_at, 'record carries a timestamp');
});

test('skill-run-tracker: records an error tool_response as failure', () => {
  const runsPath = tempRunsPath();
  const payload = JSON.stringify({
    tool_name: 'Skill',
    tool_input: { skill: 'self-heal' },
    tool_response: 'Error: skill not found',
  });

  withRunsPath(runsPath, () => hook.run(payload));

  const records = readRecords(runsPath);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].outcome, 'failure');
});

test('skill-run-tracker: object tool_response with is_error records failure', () => {
  const runsPath = tempRunsPath();
  const payload = JSON.stringify({
    tool_name: 'Skill',
    tool_input: { skill: 'verify' },
    tool_response: { is_error: true, content: 'boom' },
  });

  withRunsPath(runsPath, () => hook.run(payload));

  assert.strictEqual(readRecords(runsPath)[0].outcome, 'failure');
});

test('skill-run-tracker: non-Skill tools are ignored (no record, pass-through)', () => {
  const runsPath = tempRunsPath();
  const payload = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'git status' },
  });

  const out = withRunsPath(runsPath, () => hook.run(payload));

  assert.strictEqual(out, payload);
  assert.strictEqual(readRecords(runsPath).length, 0);
});

test('skill-run-tracker: Skill payload without a skill name is ignored', () => {
  const runsPath = tempRunsPath();
  const payload = JSON.stringify({ tool_name: 'Skill', tool_input: {} });

  const out = withRunsPath(runsPath, () => hook.run(payload));

  assert.strictEqual(out, payload);
  assert.strictEqual(readRecords(runsPath).length, 0);
});

test('skill-run-tracker: fails open on non-JSON input', () => {
  const runsPath = tempRunsPath();
  const out = withRunsPath(runsPath, () => hook.run('not json {'));

  assert.strictEqual(out, 'not json {');
  assert.strictEqual(readRecords(runsPath).length, 0);
});

test('skill-run-tracker: fails open on empty input', () => {
  const out = hook.run('');
  assert.strictEqual(out, '');
});

test('skill-run-tracker: plugin-namespaced skill names are recorded verbatim', () => {
  const runsPath = tempRunsPath();
  const payload = JSON.stringify({
    tool_name: 'Skill',
    tool_input: { skill: 'document-skills:xlsx' },
  });

  withRunsPath(runsPath, () => hook.run(payload));

  const records = readRecords(runsPath);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].skill_id, 'document-skills:xlsx');
});
