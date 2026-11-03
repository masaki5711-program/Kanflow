'use strict';

/**
 * Tests for pre-mcp-egress-guard.js — the external-MCP data egress guard
 * (CLAUDE.md §2 data sovereignty, made machine-enforced).
 *
 * Node built-in test runner only — deterministic, offline, no external deps.
 * All identifiers/credentials below are SYNTHETIC (iotpf-git-workflow §6).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const guard = require('../pre-mcp-egress-guard');

const call = (toolName, toolInput) =>
  JSON.stringify({ tool_name: toolName, tool_input: toolInput });

// ── pass-through paths ──────────────────────────────────────────────────────

test('egress-guard: clean public research query passes through', () => {
  const raw = call('mcp__exa__web_search_exa', { query: 'rust mqtt client backpressure patterns' });
  assert.equal(guard.run(raw), raw);
});

test('egress-guard: non-external tool (Bash) passes through untouched', () => {
  const raw = call('Bash', { command: 'echo plant_code=SYN-PLANT-01' });
  assert.equal(guard.run(raw), raw);
});

test('egress-guard: local MCP server (memory) passes through untouched', () => {
  const raw = call('mcp__memory__create_entities', { entities: [{ name: 'plant_code=SYN-2' }] });
  assert.equal(guard.run(raw), raw);
});

test('egress-guard: empty tool_input passes through', () => {
  const raw = call('mcp__exa__web_search_exa', {});
  assert.equal(guard.run(raw), raw);
});

test('egress-guard: fails open on non-JSON input (CLAUDE.md §7)', () => {
  const out = guard.run('definitely not json');
  assert.equal(out, 'definitely not json');
});

// ── block paths (exit 2) ────────────────────────────────────────────────────

test('egress-guard: API key in exa query -> BLOCK', () => {
  const out = guard.run(call('mcp__exa__web_search_exa', {
    query: 'why does auth fail with key sk-proj-abcdefghijklmnopqrstuv12345678',
  }));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /BLOCKED/);
  assert.match(out.stderr, /Credential/);
});

test('egress-guard: private edge IP in context7 payload -> BLOCK', () => {
  const out = guard.run(call('mcp__context7__query-docs', {
    query: 'modbus timeout connecting to 192.168.10.42 from gateway',
  }));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /Private network address/);
});

test('egress-guard: MAC address -> BLOCK', () => {
  const out = guard.run(call('mcp__exa__web_search_exa', {
    query: 'device 00:1B:44:11:3A:B7 not responding',
  }));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /MAC address/);
});

test('egress-guard: plant identifier field -> BLOCK', () => {
  const out = guard.run(call('mcp__exa__web_search_exa', {
    query: 'spc anomaly plant_code=ID-PLANT-3 line_id=L7',
  }));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /Plant \/ line \/ lot identifier/);
});

test('egress-guard: bulk numeric series (waveform shape) -> BLOCK', () => {
  const series = Array.from({ length: 60 }, (_, i) => (Math.sin(i) * 100).toFixed(3)).join(', ');
  const out = guard.run(call('mcp__exa__web_search_exa', {
    query: `what does this vibration data mean: ${series}`,
  }));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /Bulk numeric series/);
});

test('egress-guard: multiple hits are all reported', () => {
  const out = guard.run(call('mcp__exa__web_search_exa', {
    query: 'plant_code=X9 device at 10.0.0.5 password: hunter2secret',
  }));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /Plant \/ line \/ lot identifier/);
  assert.match(out.stderr, /Private network address/);
  assert.match(out.stderr, /Credential/);
});

// ── false-positive guards ───────────────────────────────────────────────────

test('egress-guard: public IP / version strings do NOT block', () => {
  const raw = call('mcp__exa__web_search_exa', {
    query: 'node 20.11.1 vs 22.3.0 performance, host 8.8.8.8 dns benchmark',
  });
  assert.equal(guard.run(raw), raw);
});

test('egress-guard: short numeric lists (legit examples) do NOT block', () => {
  const raw = call('mcp__exa__web_search_exa', {
    query: 'moving average of 1, 2, 3, 4, 5 in sql window function',
  });
  assert.equal(guard.run(raw), raw);
});

test('egress-guard: the word "password" without a value does NOT block', () => {
  const raw = call('mcp__exa__web_search_exa', {
    query: 'best practices for password hashing argon2 vs bcrypt',
  });
  assert.equal(guard.run(raw), raw);
});

// ── exported helpers ────────────────────────────────────────────────────────

test('egress-guard: isExternalMcpTool classifies servers correctly', () => {
  assert.equal(guard.isExternalMcpTool('mcp__exa__web_search_exa'), true);
  assert.equal(guard.isExternalMcpTool('mcp__context7__resolve-library-id'), true);
  assert.equal(guard.isExternalMcpTool('mcp__memory__read_graph'), false);
  assert.equal(guard.isExternalMcpTool('mcp__playwright__click'), false);
  assert.equal(guard.isExternalMcpTool('Bash'), false);
  assert.equal(guard.isExternalMcpTool(''), false);
  assert.equal(guard.isExternalMcpTool(null), false);
});
