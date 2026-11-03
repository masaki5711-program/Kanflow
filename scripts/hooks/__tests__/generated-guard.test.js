'use strict';

// Regression tests for the generated-code edit guard (schema-first enforcement).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../pre-edit-generated-guard');

function edit(file_path) {
  return JSON.stringify({ tool_name: 'Edit', tool_input: { file_path } });
}

test('blocks editing a python protobuf stub', () => {
  assert.equal(guard.run(edit('apps/ai/zeva/reading_pb2.py')).exitCode, 2);
});

test('blocks editing a python grpc stub', () => {
  assert.equal(guard.run(edit('apps/ai/zeva/reading_pb2_grpc.py')).exitCode, 2);
});

test('blocks editing a ts protobuf file', () => {
  assert.equal(guard.run(edit('apps/hub/src/gen/reading.pb.ts')).exitCode, 2);
});

test('blocks editing anything under a generated/ directory', () => {
  assert.equal(guard.run(edit('apps/hub/src/generated/client.ts')).exitCode, 2);
});

test('blocks windows-style generated paths', () => {
  assert.equal(guard.run(edit('apps\\\\ai\\\\reading_pb2.py')).exitCode, 2);
});

test('allows editing the source .proto', () => {
  assert.equal(guard.run(edit('proto/reading.proto')).exitCode, 0);
});

test('allows editing ordinary source', () => {
  assert.equal(guard.run(edit('apps/hub/src/ingest.ts')).exitCode, 0);
});

test('allows a file that merely contains "gen" in a word', () => {
  assert.equal(guard.run(edit('apps/ai/agent/gateway.py')).exitCode, 0);
});

test('fails open on malformed JSON', () => {
  assert.equal(guard.run('not json').exitCode, 0);
});

test('blocks hand-editing MISTAKES.md (generated mistake-memory view)', () => {
  const out = guard.run(edit('D:/app/agents_skills_claudecode/MISTAKES.md'));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /mistakes\.js render-md/);
});

test('does NOT block a nested file merely named like mistakes docs', () => {
  assert.equal(guard.run(edit('docs/MISTAKES_overview.md')).exitCode, 0);
});
