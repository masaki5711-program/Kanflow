'use strict';

/*
 * Fail-open smoke test for plugin-hook-bootstrap.js
 * (validate-harness-wiring.js requires every settings-wired hook to be
 * exercised by at least one test). Contract under test is CLAUDE.md §7 — a
 * hook must exit 0 on benign/malformed input, never blocking by accident.
 * (evaluate-session.js was removed in agent-model v3 Phase 3 — dead
 * continuous-learning v1 path; see docs/agent-model-changelog.md.)
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOKS = path.resolve(__dirname, '..');

test('plugin-hook-bootstrap: require()-able and inert without plugin env', () => {
  // The bootstrap is require()d inside the settings.json command line; loading
  // it directly must never throw or exit non-zero.
  const res = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(path.join(HOOKS, 'plugin-hook-bootstrap.js'))})`],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(res.status, 0, res.stderr);
});
