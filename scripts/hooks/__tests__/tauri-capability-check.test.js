'use strict';

// Tests for the Tauri capability least-privilege gate: over-broad grants in
// capabilities/*.json or tauri.conf.json block once; normal edits pass.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, findRisks, tauriEdits } = require('../pre-edit-tauri-capability-check');

function eventFor(file, content) {
  return JSON.stringify({ tool_input: { file_path: file, content } });
}

test('wildcard fs scope in a capability file is flagged', () => {
  const risks = findRisks('{"permissions":[{"identifier":"fs:allow-read","allow":[{"path":"**"}]}]}');
  assert.equal(risks.length, 1);
  assert.match(risks[0], /wildcard filesystem/);
});

test('shell:allow-execute is flagged', () => {
  assert.equal(findRisks('{"permissions":["shell:allow-execute"]}').length, 1);
});

test('csp null in tauri.conf.json is flagged', () => {
  assert.equal(findRisks('{"app":{"security":{"csp": null}}}').length, 1);
});

test('a scoped, least-privilege capability passes', () => {
  const content =
    '{"permissions":[{"identifier":"fs:allow-read","allow":[{"path":"$APPDATA/myapp/projects"}]},"dialog:allow-open"]}';
  assert.deepEqual(findRisks(content), []);
});

test('non-Tauri json files are not matched at all', () => {
  const input = { tool_input: { file_path: 'src/config/settings.json', content: '{"path":"**"}' } };
  assert.deepEqual(tauriEdits(input), []);
});

test('capability files under src-tauri are matched (Windows and POSIX separators)', () => {
  for (const p of ['src-tauri\\capabilities\\default.json', 'apps/x/src-tauri/capabilities/main.json']) {
    const input = { tool_input: { file_path: p, content: '{}' } };
    assert.equal(tauriEdits(input).length, 1, p);
  }
});

test('blocks with exit 2 on first risky edit, passes on retry (one-shot per file)', () => {
  const file = `src-tauri/capabilities/test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  const risky = eventFor(file, '{"permissions":["shell:allow-execute"]}');
  const first = run(risky);
  assert.equal(first.exitCode, 2);
  assert.match(first.stderr, /Tauri Capability Gate/);
  const second = run(risky);
  assert.equal(second, risky); // passthrough on retry
});

test('malformed input fails open (passthrough)', () => {
  const raw = 'not json {{{';
  assert.equal(run(raw), raw);
});
