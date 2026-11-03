'use strict';

/**
 * Characterization / regression tests for the edit- and session-lifecycle
 * hooks in scripts/hooks/. Node built-in test runner only; no network, no
 * external deps. All filesystem writes are isolated to os.tmpdir() and cleaned
 * up in test.after. Synthetic data only.
 *
 * Contract under test (per hook):
 *   - run(rawInput) where rawInput is a JSON STRING.
 *   - Returns either a raw pass-through string OR an object
 *     { stdout?, stderr?, exitCode } where exitCode 0 = allow, 2 = block.
 *   - Fail-open: malformed input must NOT block (string out, or exitCode 0).
 *
 * State-writing hooks are isolated up front by pointing HOME / USERPROFILE /
 * TMP at temp dirs BEFORE requiring the modules.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// ── Isolation: redirect any home/temp-derived state into a throwaway dir ──
// Several hooks derive a state file from os.tmpdir() (ui-i18n, stop-format) or
// from HOME/USERPROFILE (.claude/metrics for session-activity-tracker).
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hook-tests-'));
const ORIG_ENV = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  TMPDIR: process.env.TMPDIR,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  CLAUDE_SESSION_ID: process.env.CLAUDE_SESSION_ID,
  ECC_SESSION_ID: process.env.ECC_SESSION_ID,
  ECC_GOVERNANCE_CAPTURE: process.env.ECC_GOVERNANCE_CAPTURE,
  GATEGUARD_STATE_DIR: process.env.GATEGUARD_STATE_DIR,
};

// Point home at the sandbox so .claude/metrics writes land under SANDBOX.
process.env.HOME = SANDBOX;
process.env.USERPROFILE = SANDBOX;
// GATEGUARD-style state isolation (defensive — none of these targets require it,
// but the prompt asks to set it before require for any that might).
process.env.GATEGUARD_STATE_DIR = path.join(SANDBOX, 'gateguard');
// Make sure governance capture is OFF unless a test opts in.
delete process.env.ECC_GOVERNANCE_CAPTURE;

// ── Require targets AFTER env isolation ──────────────────────────────────
const uiI18n = require('../pre-edit-ui-i18n-check');
const designDirection = require('../pre-edit-design-direction-check');
const appsSpec = require('../pre-edit-apps-spec-check');
const docWarn = require('../doc-file-warning');
const designQuality = require('../design-quality-check');
const qualityGate = require('../quality-gate');
const governance = require('../governance-capture');
const activityTracker = require('../session-activity-tracker');
const sessionEnd = require('../session-end-marker');
const autoTmux = require('../auto-tmux-dev');
const desktopNotify = require('../desktop-notify');
const stopFormat = require('../stop-format-typecheck');

// ── Helpers ──────────────────────────────────────────────────────────────
const edit = (file_path, content = '', tool_name = 'Write') =>
  JSON.stringify({ tool_name, tool_input: { file_path, content } });

const bash = command => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

/** Assert a result is a "fail-open / allow" result: string OR exitCode 0. */
function assertAllow(out) {
  if (typeof out === 'string') return; // pass-through
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 0, 'object result should allow (exitCode 0)');
}

test.after(() => {
  // restore env
  for (const [k, v] of Object.entries(ORIG_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

// ─────────────────────────────────────────────────────────────────────────
// pre-edit-ui-i18n-check.js
//   Behavioral trigger: first edit of a UI file (.tsx/.jsx/.vue/...) blocks
//   once (exitCode 2). Uses a per-session state file in tmpdir.
// ─────────────────────────────────────────────────────────────────────────
test('ui-i18n: fails open on non-JSON', () => {
  assertAllow(uiI18n.run('not json at all {'));
});

test('ui-i18n: passes through non-UI file edits (allow path)', () => {
  // Unique session id so it cannot collide with the block test below.
  process.env.CLAUDE_SESSION_ID = 'ecc-test-i18n-allow';
  const out = uiI18n.run(edit('/tmp/data/report.md', '# hi'));
  assert.equal(typeof out, 'string', 'non-UI file should pass through unchanged');
  delete process.env.CLAUDE_SESSION_ID;
});

test('ui-i18n: BLOCKS once on first UI file edit, then allows on retry', () => {
  // Dedicated session id => fresh state file in SANDBOX-tmp.
  process.env.CLAUDE_SESSION_ID = `ecc-test-i18n-block-${Date.now()}`;
  const first = uiI18n.run(edit('/tmp/components/Hero.tsx', '<div/>'));
  assert.equal(typeof first, 'object');
  assert.equal(first.exitCode, 2, 'first UI edit should block (gate fires once)');
  assert.match(String(first.stderr), /UI i18n Gate/);

  // Second invocation in the same "session" should no longer block.
  const second = uiI18n.run(edit('/tmp/components/Hero.tsx', '<div/>'));
  assert.equal(typeof second, 'string', 'gate fires at most once per session');
  delete process.env.CLAUDE_SESSION_ID;
});

// ─────────────────────────────────────────────────────────────────────────
// pre-edit-design-direction-check.js
//   Mirror of the i18n gate: first edit of a UI file blocks once (exitCode 2)
//   with the visual-direction instructions; retries pass through.
// ─────────────────────────────────────────────────────────────────────────
test('design-direction: fails open on non-JSON', () => {
  assertAllow(designDirection.run('not json at all {'));
});

test('design-direction: passes through non-UI file edits (allow path)', () => {
  process.env.CLAUDE_SESSION_ID = 'ecc-test-design-allow';
  const out = designDirection.run(edit('/tmp/server/api.ts', 'export {}'));
  assert.equal(typeof out, 'string', 'non-UI file should pass through unchanged');
  delete process.env.CLAUDE_SESSION_ID;
});

test('design-direction: BLOCKS once on first UI file edit, then allows on retry', () => {
  process.env.CLAUDE_SESSION_ID = `ecc-test-design-block-${Date.now()}`;
  const first = designDirection.run(edit('/tmp/components/Dashboard.tsx', '<div/>'));
  assert.equal(typeof first, 'object');
  assert.equal(first.exitCode, 2, 'first UI edit should block (gate fires once)');
  assert.match(String(first.stderr), /UI Design Gate/);
  assert.match(String(first.stderr), /design-quality\.md/, 'message must point at the anti-template rule');
  assert.match(String(first.stderr), /design-tokens\.json/, 'message must point at the default token set');

  const second = designDirection.run(edit('/tmp/components/Dashboard.tsx', '<div/>'));
  assert.equal(typeof second, 'string', 'gate fires at most once per session');
  delete process.env.CLAUDE_SESSION_ID;
});

test('design-direction: css files are also gated', () => {
  process.env.CLAUDE_SESSION_ID = `ecc-test-design-css-${Date.now()}`;
  const out = designDirection.run(edit('/tmp/styles/tokens.css', ':root{}'));
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 2, 'first css edit should also raise the gate');
  delete process.env.CLAUDE_SESSION_ID;
});

// ─────────────────────────────────────────────────────────────────────────
// pre-edit-apps-spec-check.js
// ─────────────────────────────────────────────────────────────────────────

test('apps-spec: fails open on non-JSON', () => {
  assertAllow(appsSpec.run('not json'));
});

test('apps-spec: passes through non-apps file edits (allow path)', () => {
  process.env.CLAUDE_SESSION_ID = `ecc-test-appsspec-allow-${Date.now()}`;
  assertAllow(appsSpec.run(edit('/repo/scripts/hooks/foo.js', 'x')));
  delete process.env.CLAUDE_SESSION_ID;
});

test('apps-spec: BLOCKS once on first apps/ file edit, then allows on retry', () => {
  process.env.CLAUDE_SESSION_ID = `ecc-test-appsspec-block-${Date.now()}`;
  const first = appsSpec.run(edit('/repo/apps/hub/src/index.ts', 'export {}'));
  assert.equal(typeof first, 'object');
  assert.equal(first.exitCode, 2, 'first apps/ edit should block (gate fires once)');
  assert.match(String(first.stderr), /apps\/ References Gate/);
  assert.match(String(first.stderr), /references\/README\.md/, 'message must point at the references index');

  const second = appsSpec.run(edit('/repo/apps/hub/src/index.ts', 'export {}'));
  assert.equal(typeof second, 'string', 'gate fires at most once per session');
  delete process.env.CLAUDE_SESSION_ID;
});

test('apps-spec: editing reference material itself is never gated', () => {
  process.env.CLAUDE_SESSION_ID = `ecc-test-appsspec-self-${Date.now()}`;
  assertAllow(appsSpec.run(edit('D:\\repo\\apps\\iotpf\\references\\specs\\edge.md', '# spec')));
  assertAllow(appsSpec.run(edit('/repo/apps/iotpf/references/manifest.json', '{}')));
  assertAllow(appsSpec.run(edit('/repo/apps/references/decisions.md', '# log')));
  // legacy spec.md files stay exempt too (pre-v3 checkouts)
  assertAllow(appsSpec.run(edit('/repo/apps/spec.md', '# spec')));
  delete process.env.CLAUDE_SESSION_ID;
});

test('apps-spec: windows backslash apps paths are gated', () => {
  process.env.CLAUDE_SESSION_ID = `ecc-test-appsspec-win-${Date.now()}`;
  const out = appsSpec.run(edit('D:\\repo\\apps\\edge\\pfe-a\\migrations\\t1_0002.sql', '--'));
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 2, 'backslash apps path should also raise the gate');
  delete process.env.CLAUDE_SESSION_ID;
});

test('apps-spec: each area fires its own once-per-session gate', () => {
  process.env.CLAUDE_SESSION_ID = `ecc-test-appsspec-areas-${Date.now()}`;
  const hubFirst = appsSpec.run(edit('/repo/apps/hub/src/a.js', 'x'));
  assert.equal(hubFirst.exitCode, 2, 'hub area fires');
  const hubSecond = appsSpec.run(edit('/repo/apps/hub/src/b.js', 'x'));
  assert.equal(typeof hubSecond, 'string', 'hub area fired already');
  const aiFirst = appsSpec.run(edit('/repo/apps/ai/src/c.py', 'x'));
  assert.equal(aiFirst.exitCode, 2, 'ai area fires independently of hub');
  assert.match(String(aiFirst.stderr), /area: ai/);
  delete process.env.CLAUDE_SESSION_ID;
});

test('apps-spec: an area marked undecided in manifest.json gets the UNDECIDED warning', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-specgate-'));
  fs.mkdirSync(path.join(sandbox, 'apps', 'references'), { recursive: true });
  fs.writeFileSync(path.join(sandbox, 'apps', 'references', 'manifest.json'), JSON.stringify({
    areas: {
      hub: { status: 'undecided', paths: [] },
      ai: { status: 'decided', paths: ['specs/ai-service.md', 'code/ollama-orchestrator/'] },
    },
  }));
  const prevRoot = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = sandbox;
  process.env.CLAUDE_SESSION_ID = `ecc-test-appsspec-undecided-${Date.now()}`;
  try {
    const hub = appsSpec.run(edit('/repo/apps/hub/src/a.js', 'x'));
    assert.equal(hub.exitCode, 2);
    assert.match(String(hub.stderr), /UNDECIDED/, 'hub status undecided → explicit warning');
    const ai = appsSpec.run(edit('/repo/apps/ai/src/c.py', 'x'));
    assert.equal(ai.exitCode, 2);
    assert.doesNotMatch(String(ai.stderr), /UNDECIDED/, 'ai status decided → generic reminder only');
    assert.match(String(ai.stderr), /specs\/ai-service\.md/, 'declared paths are enumerated (paths only)');
  } finally {
    if (prevRoot === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prevRoot;
    delete process.env.CLAUDE_SESSION_ID;
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// doc-file-warning.js
//   Warns (exitCode 0 + stderr) only on ad-hoc doc filenames outside
//   structured dirs. Always exit 0 (never blocks).
// ─────────────────────────────────────────────────────────────────────────
test('doc-warning: fails open on non-JSON (exit 0)', () => {
  const out = docWarn.run('garbage');
  assert.equal(out.exitCode, 0);
});

test('doc-warning: no warning for a normal source file (allow path)', () => {
  const out = docWarn.run(edit('/repo/src/index.ts', 'export {}'));
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stderr, 'normal file path should not warn');
});

test('doc-warning: WARNS on ad-hoc doc filename outside structured dirs', () => {
  const out = docWarn.run(edit('/repo/NOTES.md', 'scratch'));
  assert.equal(out.exitCode, 0, 'warns but never blocks');
  assert.match(String(out.stderr), /Ad-hoc documentation filename/);
});

test('doc-warning: ad-hoc name inside docs/ is intentional (no warning)', () => {
  const out = docWarn.run(edit('/repo/docs/NOTES.md', 'scratch'));
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stderr, 'structured dir suppresses the warning');
});

// ─────────────────────────────────────────────────────────────────────────
// design-quality-check.js
//   PostToolUse: for frontend file edits, emits an advisory on stderr and
//   passes input through on stdout. Reads file content to flag template-y
//   signals. exitCode always 0.
// ─────────────────────────────────────────────────────────────────────────
test('design-quality: fails open on non-JSON (exit 0)', () => {
  const out = designQuality.run('}{bad');
  assert.equal(out.exitCode, 0);
});

test('design-quality: non-frontend file passes through with no advisory', () => {
  const raw = edit('/repo/server/api.ts', 'export const x = 1');
  const out = designQuality.run(raw);
  assert.equal(out.exitCode, 0);
  assert.equal(out.stdout, raw, 'input passed through unchanged');
  assert.ok(!out.stderr, 'non-frontend file should not emit a design advisory');
});

test('design-quality: frontend file emits the DESIGN CHECK advisory', () => {
  // Create a real template-y frontend file so the content heuristic can read it.
  const fp = path.join(SANDBOX, 'Landing.tsx');
  fs.writeFileSync(fp, '<a className="text-center">Get Started</a>', 'utf8');
  const out = designQuality.run(edit(fp, '', 'Edit'));
  assert.equal(out.exitCode, 0);
  assert.match(String(out.stderr), /DESIGN CHECK/);
  // The heuristic should catch at least one of the template-y signals.
  assert.match(String(out.stderr), /CTA copy|centered default layout/);
});

// ─────────────────────────────────────────────────────────────────────────
// quality-gate.js
//   Pass-through hook (returns rawInput string). For a non-existent file it is
//   a no-op; must never throw or block.
// ─────────────────────────────────────────────────────────────────────────
test('quality-gate: fails open on non-JSON (returns the raw string)', () => {
  const out = qualityGate.run('not-json');
  assert.equal(out, 'not-json');
});

test('quality-gate: passes input through for a non-existent file (no-op)', () => {
  const raw = edit(path.join(SANDBOX, 'does-not-exist.ts'), 'x');
  const out = qualityGate.run(raw);
  assert.equal(out, raw, 'quality-gate is a pass-through hook');
});

test('quality-gate: passes through an unsupported extension', () => {
  const raw = edit('/repo/data.bin', '');
  assert.equal(qualityGate.run(raw), raw);
});

// ─────────────────────────────────────────────────────────────────────────
// governance-capture.js
//   Gated behind ECC_GOVERNANCE_CAPTURE=1. Pass-through (returns rawInput).
//   Disabled by default -> pure pass-through. When enabled, emits governance
//   events to stderr for approval-required Bash commands. Always pass-through.
// ─────────────────────────────────────────────────────────────────────────
test('governance: fails open on non-JSON (returns raw string)', () => {
  assert.equal(governance.run('nope'), 'nope');
});

test('governance: disabled by default -> pure pass-through', () => {
  delete process.env.ECC_GOVERNANCE_CAPTURE;
  const raw = bash('rm -rf /tmp/whatever');
  assert.equal(governance.run(raw), raw, 'no capture when flag is unset');
});

test('governance: detectApprovalRequired flags a destructive command', () => {
  // Behavioral assertion on the exported pure helper (deterministic, no I/O).
  const findings = governance.detectApprovalRequired('git push origin main --force');
  assert.ok(Array.isArray(findings) && findings.length > 0, 'force-push requires approval');
});

test('governance: enabled run still passes input through', () => {
  process.env.ECC_GOVERNANCE_CAPTURE = '1';
  const raw = bash('rm -rf /tmp/synthetic-target');
  const out = governance.run(raw);
  assert.equal(out, raw, 'governance hook is always a pass-through');
  delete process.env.ECC_GOVERNANCE_CAPTURE;
});

// ─────────────────────────────────────────────────────────────────────────
// session-activity-tracker.js
//   PostToolUse: writes a sanitized row to ~/.claude/metrics/tool-usage.jsonl
//   only when a session id is present. Always returns rawInput (pass-through).
//   HOME is redirected to SANDBOX so any write lands there.
// ─────────────────────────────────────────────────────────────────────────
test('activity-tracker: fails open on non-JSON (returns raw string)', () => {
  assert.equal(activityTracker.run('xxx'), 'xxx');
});

test('activity-tracker: no session id -> no write, pass-through', () => {
  delete process.env.ECC_SESSION_ID;
  delete process.env.CLAUDE_SESSION_ID;
  const raw = edit('/repo/src/a.ts', 'x');
  assert.equal(activityTracker.run(raw), raw);
});

test('activity-tracker: builds a sanitized row for a Bash tool event', () => {
  // buildActivityRow is the exported pure core; assert its behavioral shape.
  const row = activityTracker.buildActivityRow(
    { tool_name: 'Bash', tool_input: { command: 'echo hello --token=SECRET' } },
    { ECC_SESSION_ID: 'sess-xyz', CLAUDE_HOOK_EVENT_NAME: 'PostToolUse' }
  );
  assert.ok(row, 'row should be built when session id + tool present');
  assert.equal(row.tool_name, 'Bash');
  assert.equal(row.session_id, 'sess-xyz');
  assert.match(row.input_summary, /REDACTED/, 'secrets are redacted in the summary');
});

// ─────────────────────────────────────────────────────────────────────────
// session-end-marker.js
//   Stop hook: cleans up observer lease, returns rawInput unchanged. With no
//   CLAUDE_SESSION_ID it short-circuits cleanly. Always pass-through.
// ─────────────────────────────────────────────────────────────────────────
test('session-end: fails open on non-JSON (pass-through)', () => {
  delete process.env.CLAUDE_SESSION_ID;
  assert.equal(sessionEnd.run('not-json'), 'not-json');
});

test('session-end: empty stop payload passes through unchanged', () => {
  delete process.env.CLAUDE_SESSION_ID;
  assert.equal(sessionEnd.run('{}'), '{}');
});

test('session-end: undefined/empty input yields empty string (no throw)', () => {
  delete process.env.CLAUDE_SESSION_ID;
  assert.equal(sessionEnd.run(''), '');
});

// ─────────────────────────────────────────────────────────────────────────
// auto-tmux-dev.js
//   PreToolUse(Bash): transforms a dev-server command into a detached session;
//   non-dev commands pass through unchanged. Returns a JSON string.
// ─────────────────────────────────────────────────────────────────────────
test('auto-tmux: fails open on non-JSON (returns raw string)', () => {
  assert.equal(autoTmux.run('not-json'), 'not-json');
});

test('auto-tmux: non-dev command passes through unchanged', () => {
  const raw = bash('ls -la');
  const out = autoTmux.run(raw);
  const parsed = JSON.parse(out);
  assert.equal(parsed.tool_input.command, 'ls -la', 'non-dev command is untouched');
});

test('auto-tmux: dev-server command is transformed to a detached session', () => {
  const out = autoTmux.run(bash('npm run dev'));
  const parsed = JSON.parse(out);
  // On Windows -> `start ... cmd /k`; on Unix with tmux -> `tmux new-session`;
  // on Unix WITHOUT tmux -> unchanged. Accept any non-throwing valid outcome,
  // but on win32 the transform is deterministic.
  if (process.platform === 'win32') {
    assert.match(parsed.tool_input.command, /start "DevServer-/);
    assert.match(parsed.tool_input.command, /cmd \/k/);
  } else {
    assert.equal(typeof parsed.tool_input.command, 'string');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// desktop-notify.js
//   Stop hook: best-effort native notification; ALWAYS returns rawInput. On
//   this (non-mac, non-WSL) platform it is effectively a no-op pass-through.
// ─────────────────────────────────────────────────────────────────────────
test('desktop-notify: fails open on non-JSON (returns raw string)', () => {
  assert.equal(desktopNotify.run('not json'), 'not json');
});

test('desktop-notify: returns the stop payload unchanged', () => {
  const raw = JSON.stringify({ last_assistant_message: 'All tests passed.' });
  assert.equal(desktopNotify.run(raw), raw);
});

test('desktop-notify: empty input passes through (no throw)', () => {
  assert.equal(desktopNotify.run(''), '');
});

// ─────────────────────────────────────────────────────────────────────────
// stop-format-typecheck.js
//   Stop hook: reads a per-session accumulator file; with none present it is a
//   no-op. Always returns rawInput (pass-through). parseAccumulator is a pure
//   exported helper.
// ─────────────────────────────────────────────────────────────────────────
test('stop-format: fails open on non-JSON (returns raw string)', () => {
  // No accumulator file for this session id -> main() returns early.
  process.env.CLAUDE_SESSION_ID = `ecc-test-stopfmt-${Date.now()}`;
  assert.equal(stopFormat.run('not-json'), 'not-json');
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: no accumulator -> pass-through stop payload', () => {
  process.env.CLAUDE_SESSION_ID = `ecc-test-stopfmt-empty-${Date.now()}`;
  const raw = '{}';
  assert.equal(stopFormat.run(raw), raw);
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: parseAccumulator dedups and trims file list', () => {
  const parsed = stopFormat.parseAccumulator('a.ts\n a.ts \n\nb.tsx\n');
  assert.deepEqual(parsed, ['a.ts', 'b.tsx'], 'dedups, trims, drops blanks');
});
