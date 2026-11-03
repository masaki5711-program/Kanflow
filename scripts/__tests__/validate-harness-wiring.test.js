'use strict';

/*
 * Tests for scripts/validate-harness-wiring.js — the harness self-extension
 * gate (orphan/untested hooks, unrouted IoTPF skills). Synthetic sandbox.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-harness-wiring.js');

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-wiring-'));

function write(rel, content) {
  const p = path.join(SANDBOX, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// Wired via settings + tested.
write('scripts/hooks/wired-hook.js', "'use strict'; module.exports = {};\n");
// Wired in-process (required by wired-hook? no — by dispatcher below) + tested.
write('scripts/hooks/chained-hook.js', "'use strict'; module.exports = { run: x => x };\n");
write('scripts/hooks/dispatcher-hook.js',
  "'use strict';\nconst { run } = require('./chained-hook');\nmodule.exports = { run };\n");
// Deliberate standalone, marked + tested.
write('scripts/hooks/legacy-shim.js',
  "'use strict';\n/* @ecc-wiring: standalone — legacy shim for direct consumers */\nmodule.exports = {};\n");
// ORPHAN: not wired anywhere, no marker (but tested — isolates violation 1).
write('scripts/hooks/orphan-hook.js', "'use strict'; module.exports = {};\n");
// UNTESTED: wired via settings but never named in tests (isolates violation 2).
write('scripts/hooks/untested-hook.js', "'use strict'; module.exports = {};\n");

write('.claude/settings.json', JSON.stringify({
  hooks: {
    PreToolUse: [
      { hooks: [{ command: 'node scripts/hooks/wired-hook.js' }] },
      { hooks: [{ command: 'node scripts/hooks/dispatcher-hook.js' }] },
      { hooks: [{ command: 'node scripts/hooks/untested-hook.js' }] },
    ],
  },
}));
write('scripts/hooks/__tests__/hooks.test.js', [
  "// names: wired-hook chained-hook dispatcher-hook legacy-shim orphan-hook",
  "test('noop', () => {});",
].join('\n'));

// Domain skill (IoTPF / project) routed / unrouted; generic skill unrouted (allowed).
write('.claude/skills/routed-domain-skill/SKILL.md',
  '---\nname: routed-domain-skill\ndescription: x\norigin: IoTPF\n---\nbody\n');
write('.claude/skills/orphan-domain-skill/SKILL.md',
  '---\nname: orphan-domain-skill\ndescription: x\norigin: IoTPF\n---\nbody\n');
write('.claude/skills/routed-project-skill/SKILL.md',
  '---\nname: routed-project-skill\ndescription: x\norigin: project\n---\nbody\n');
write('.claude/skills/orphan-project-skill/SKILL.md',
  '---\nname: orphan-project-skill\ndescription: x\norigin: project\n---\nbody\n');
write('.claude/skills/generic-skill/SKILL.md',
  '---\nname: generic-skill\ndescription: x\n---\nbody\n');
write('.claude/rules/iotpf-agents-skills.md',
  'routing:\n- `routed-domain-skill` — used here\n- `routed-project-skill` — used here\n');

process.env.CLAUDE_PROJECT_DIR = SANDBOX;
const { validateHooks, validateIotpfSkills } = require('../validate-harness-wiring');

test.after(() => {
  delete process.env.CLAUDE_PROJECT_DIR;
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* best-effort */ }
});

test('hooks: settings-wired, in-process-chained, and marked-standalone hooks all pass', () => {
  const errors = validateHooks();
  for (const okName of ['wired-hook', 'chained-hook', 'dispatcher-hook', 'legacy-shim']) {
    assert.ok(!errors.some(e => e.includes(`${okName}.js`)), `${okName} must not be flagged: ${errors}`);
  }
});

test('hooks: an unwired, unmarked hook is an orphan error', () => {
  const errors = validateHooks().filter(e => e.includes('orphan-hook.js'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /orphan hook/);
});

test('hooks: a wired hook named in no test is an untested error', () => {
  const errors = validateHooks().filter(e => e.includes('untested-hook.js'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no test under/);
});

test('skills: unrouted IoTPF and project skills error; routed and generic skills pass', () => {
  const errors = validateIotpfSkills();
  assert.equal(errors.length, 2, JSON.stringify(errors));
  assert.ok(errors.some(e => /orphan-domain-skill/.test(e) && /not routed/.test(e)), JSON.stringify(errors));
  assert.ok(errors.some(e => /orphan-project-skill/.test(e) && /not routed/.test(e)), JSON.stringify(errors));
  assert.ok(!errors.some(e => /routed-project-skill/.test(e)), JSON.stringify(errors));
});

test('CLI: the real repository passes the wiring gate', () => {
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
    timeout: 30_000,
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /OK — \d+ hooks wired\+tested/);
});
