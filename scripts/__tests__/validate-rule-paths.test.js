'use strict';

/*
 * Tests for validate-rule-paths.js — the on-demand rule loading gate.
 * Uses a synthetic project tree; also asserts the real repo passes.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'validate-rule-paths.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function runGate(rootDir) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: rootDir },
  });
}

function scaffold(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-paths-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return root;
}

test('passes: imported rule without paths + on-demand rule with paths', () => {
  const root = scaffold({
    'CLAUDE.md': '@.claude/rules/common/base.md\n',
    '.claude/rules/common/base.md': '# always-on rule (imported)\n',
    '.claude/rules/lang/on-demand.md': '---\npaths:\n  - "src/**"\n---\n# scoped\n',
  });
  const res = runGate(root);
  assert.equal(res.status, 0, res.stderr);
  fs.rmSync(root, { recursive: true, force: true });
});

test('FAILS: a rule that is neither imported nor paths-scoped (context bloat)', () => {
  const root = scaffold({
    'CLAUDE.md': '@.claude/rules/common/base.md\n',
    '.claude/rules/common/base.md': '# always-on rule\n',
    '.claude/rules/rogue.md': '# forgot paths: — would load every session\n',
  });
  const res = runGate(root);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /rogue\.md/);
  assert.match(res.stderr, /paths:/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('FAILS: frontmatter present but no paths key', () => {
  const root = scaffold({
    'CLAUDE.md': '',
    '.claude/rules/half.md': '---\ndescription: has frontmatter, no paths\n---\n# x\n',
  });
  const res = runGate(root);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /half\.md/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the real repository passes the gate', () => {
  const res = runGate(REPO_ROOT);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /always-imported/);
});
