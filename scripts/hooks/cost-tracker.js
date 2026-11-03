#!/usr/bin/env node
/**
 * Cost Tracker Hook
 *
 * Appends lightweight session usage metrics to ~/.claude/metrics/costs.jsonl.
 */

'use strict';

const path = require('path');
const {
  ensureDir,
  appendFile,
  getClaudeDir,
} = require('../lib/utils');

const MAX_STDIN = 1024 * 1024;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function estimateCost(model, inputTokens, outputTokens) {
  // Approximate per-1M-token blended rates. Conservative defaults.
  const table = {
    'haiku': { in: 0.8, out: 4.0 },
    'sonnet': { in: 3.0, out: 15.0 },
    'opus': { in: 15.0, out: 75.0 },
  };

  const normalized = String(model || '').toLowerCase();
  let rates = table.sonnet;
  if (normalized.includes('haiku')) rates = table.haiku;
  if (normalized.includes('opus')) rates = table.opus;

  const cost = (inputTokens / 1_000_000) * rates.in + (outputTokens / 1_000_000) * rates.out;
  return Math.round(cost * 1e6) / 1e6;
}

/**
 * Core logic, runnable in-process via run-with-flags.js or as a child process.
 * Parses the raw stdin string, appends a usage-metrics row to costs.jsonl, then
 * returns the raw input unchanged (plain pass-through). Errors are swallowed so
 * the hook never blocks. Returns the raw input string.
 *
 * @param {string} rawInput accumulated stdin
 * @returns {string} the raw input, unchanged
 */
function run(rawInput, _opts) {
  const raw = typeof rawInput === 'string' ? rawInput : '';
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const usage = input.usage || input.token_usage || {};
    const inputTokens = toNumber(usage.input_tokens || usage.prompt_tokens || 0);
    const outputTokens = toNumber(usage.output_tokens || usage.completion_tokens || 0);

    const model = String(input.model || input._cursor?.model || process.env.CLAUDE_MODEL || 'unknown');
    const sessionId = String(process.env.ECC_SESSION_ID || process.env.CLAUDE_SESSION_ID || 'default');

    const metricsDir = path.join(getClaudeDir(), 'metrics');
    ensureDir(metricsDir);

    const row = {
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimateCost(model, inputTokens, outputTokens),
    };

    appendFile(path.join(metricsDir, 'costs.jsonl'), `${JSON.stringify(row)}\n`);
  } catch {
    // Keep hook non-blocking.
  }

  return raw;
}

module.exports = { run, estimateCost, toNumber };

// Direct-invocation behavior, unchanged.
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    process.stdout.write(run(raw));
  });

  process.stdin.on('error', () => process.exit(0));
}
