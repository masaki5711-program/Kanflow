'use strict';

// Regression tests for the Stop test-gate's command-not-found detection.
// Guards the bug where a runner missing off-PATH on another PC made shell:true
// cmd.exe exit non-zero ("'pnpm' is not recognized") and the gate mistook that
// for a test FAILURE, firing a false block MAX_ATTEMPTS times.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isCommandNotFound, listTestTargets } = require('../stop-test-gate');

function makeProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-testgate-fixture-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return root;
}

// Guards the Tauri-layout bug: a root package.json used to TERMINATE detection
// (return-or-null), so a nested src-tauri/Cargo.toml could never contribute a
// `cargo test` suite — Rust code shipped unverified under a green Stop.
test('Tauri layout yields BOTH the npm suite and the src-tauri cargo suite', () => {
  const root = makeProject({
    'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
    'src-tauri/Cargo.toml': '[package]\nname = "app"\n',
  });
  const targets = listTestTargets(root);
  assert.deepEqual(
    targets.map(t => t.kind),
    ['package-json', 'cargo'],
  );
  assert.equal(targets[1].cwd, path.join(root, 'src-tauri'));
});

test('package.json without a test script still yields the src-tauri cargo suite', () => {
  const root = makeProject({
    'package.json': JSON.stringify({ name: 'app' }),
    'src-tauri/Cargo.toml': '[package]\nname = "app"\n',
  });
  assert.deepEqual(listTestTargets(root).map(t => t.kind), ['cargo']);
});

test('a root Cargo.toml supersedes src-tauri (workspace runs it once)', () => {
  const root = makeProject({
    'Cargo.toml': '[workspace]\nmembers = ["src-tauri"]\n',
    'src-tauri/Cargo.toml': '[package]\nname = "app"\n',
  });
  const targets = listTestTargets(root);
  assert.deepEqual(targets.map(t => t.kind), ['cargo']);
  assert.equal(targets[0].cwd, root);
});

test('npm default "no test specified" script is not a suite', () => {
  const root = makeProject({
    'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
  });
  assert.deepEqual(listTestTargets(root), []);
});

test('package.json alongside a root Cargo.toml yields both suites', () => {
  const root = makeProject({
    'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
    'Cargo.toml': '[package]\nname = "app"\n',
  });
  assert.deepEqual(listTestTargets(root).map(t => t.kind), ['package-json', 'cargo']);
});

test('detects Windows cmd.exe "is not recognized" as command-not-found', () => {
  const r = { status: 1, stderr: "'pnpm.cmd' is not recognized as an internal or external command,\noperable program or batch file." };
  assert.equal(isCommandNotFound(r), true);
});

test('detects Windows exit code 9009 as command-not-found', () => {
  assert.equal(isCommandNotFound({ status: 9009, stderr: '' }), true);
});

test('a real failing test run is NOT treated as command-not-found', () => {
  const r = { status: 1, stderr: '', stdout: '1 failing\n  AssertionError: expected 2 to equal 3' };
  assert.equal(isCommandNotFound(r), false);
});

test('does not false-positive on ordinary "not found" test output', () => {
  const r = { status: 1, stdout: 'Test: returns 404 when key: not found in store' };
  assert.equal(isCommandNotFound(r), false);
});

test('a clean pass is not command-not-found', () => {
  assert.equal(isCommandNotFound({ status: 0, stdout: 'all tests passed' }), false);
});
