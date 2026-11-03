#!/usr/bin/env node
/**
 * PreToolUse Hook: Generated-Code Edit Guard (schema-first enforcement)
 *
 * Blocks hand-edits to GENERATED wire-contract code (gRPC/protobuf stubs and
 * other codegen output). Per iotpf-architecture-contracts.md §1: "generated code
 * is generated, never hand-edited" — re-generate from the .proto / schema via
 * `make proto`. A hand-patched stub is the exact seam where the two sides of an
 * interface silently diverge and the model starts guessing (hallucination).
 *
 * Fires only on generated-file path patterns, which do not exist until codegen
 * runs — so it is inert on a repo without generated artifacts and never
 * false-positives on source.
 *
 * Behavior (CLAUDE.md §7): generated path -> exit 2 with the regenerate command;
 * anything else, or any parse/internal error -> pass through (exit 0).
 *
 * Exit codes: 0 allow - 2 block.
 * Compatible with run-with-flags.js via module.exports.run().
 */

'use strict';

const MAX_STDIN = 1024 * 1024; // 1 MB safety cap

// Path shapes that are codegen OUTPUT across the project's languages.
const GENERATED = [
  { re: /_pb2\.py$/i,            label: 'python protobuf (*_pb2.py)' },
  { re: /_pb2_grpc\.py$/i,       label: 'python grpc (*_pb2_grpc.py)' },
  { re: /\.pb\.(ts|js)$/i,       label: 'ts/js protobuf (*.pb.ts)' },
  { re: /_pb\.(ts|js)$/i,        label: 'ts/js protobuf (*_pb.ts)' },
  { re: /\.pb\.go$/i,            label: 'go protobuf (*.pb.go)' },
  { re: /\.pb\.rs$/i,            label: 'rust prost (*.pb.rs)' },
  { re: /[\\/](generated|__generated__|gen)[\\/]/i, label: 'generated/ directory' },
  {
    re: /(^|[\\/])MISTAKES\.md$/,
    label: 'mistake-memory view (generated from .claude/mistakes/records.jsonl)',
    fix: 'add a record:  node scripts/mistakes.js add --json \'{...}\'\n  regenerate:    node scripts/mistakes.js render-md',
  },
];

function matchGenerated(filePath) {
  if (!filePath) return null;
  const p = String(filePath).replace(/\\/g, '/');
  for (const g of GENERATED) if (g.re.test(p)) return g;
  return null;
}

function blockMessage(filePath, label, fix) {
  const fixLines = fix
    ? ['Fix: edit the source of truth, then regenerate —', '  ' + fix]
    : [
        'Fix: change the schema, then regenerate —',
        '  1. edit the source of truth:  proto/<service>.proto  (or schemas/...)',
        '  2. regenerate:                make proto        (never raw protoc)',
      ];
  return [
    '[generated-guard] BLOCKED — hand-editing generated code is not allowed.',
    '',
    'File:   ' + filePath,
    'Kind:   ' + label,
    '',
    'Generated code is GENERATED (iotpf-architecture-contracts.md 1). Editing it',
    'by hand is the seam where the two sides of the contract silently diverge.',
    '',
    ...fixLines,
    '',
    'To disable temporarily:  ECC_DISABLED_HOOKS=pre:edit:generated-guard',
  ].join('\n') + '\n';
}

function evaluate(rawInput) {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (_) {
    return { stdout: rawInput, exitCode: 0 };
  }
  const ti = (input && input.tool_input) || {};
  const filePath = ti.file_path || ti.path || '';
  const hit = matchGenerated(filePath);
  if (!hit) return { stdout: rawInput, exitCode: 0 };
  return { stderr: blockMessage(filePath, hit.label, hit.fix), exitCode: 2 };
}

function run(rawInput) {
  try {
    return evaluate(rawInput);
  } catch (err) {
    process.stderr.write('[generated-guard] internal error (fail-open): ' + err.message + '\n');
    return { stdout: rawInput, exitCode: 0 };
  }
}

// stdin entry point (when invoked directly, not via run-with-flags)
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
  });
  process.stdin.on('end', () => {
    const r = run(data);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.stdout) process.stdout.write(r.stdout);
    process.exit(r.exitCode || 0);
  });
  process.stdin.on('error', () => process.exit(0)); // fail-open
}

module.exports = { run, evaluate, matchGenerated };
