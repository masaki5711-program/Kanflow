#!/usr/bin/env node
/**
 * PreToolUse Hook: External-MCP Data Egress Guard
 *
 * CLAUDE.md §2 / §4: never send raw waveforms, plant identifiers, credentials,
 * or any manufacturing-confidential content to an external/cloud MCP server.
 * This hook inspects the payload of tool calls bound for the configured
 * external MCP servers (exa web search, context7 docs lookup) and BLOCKS
 * (exit 2) when a high-confidence confidential pattern is present.
 *
 * Detection is intentionally high-precision (low false-positive) so public
 * research queries are never blocked:
 *   - credentials / API keys / tokens
 *   - private network addresses & MAC addresses (edge topology)
 *   - plant / line / lot identifier fields (plant_code, line_id, lot_no, ...)
 *   - bulk numeric series (raw waveform / sensor capture shape)
 *
 * Fails open per CLAUDE.md §7 — any internal error passes the call through.
 * Compatible with run-with-flags.js via module.exports.run().
 * Cross-platform (Windows, macOS, Linux). Built-in modules only.
 */

'use strict';

const MAX_STDIN = 1024 * 1024;

// Tool-name prefixes of EXTERNAL (cloud) MCP servers from .mcp.json.
// Local/forge servers (memory, playwright, sequential-thinking, github) are
// out of scope: github is the project forge, the rest never leave the machine.
const EXTERNAL_MCP_PREFIXES = ['mcp__exa__', 'mcp__context7__'];

const CONFIDENTIAL_RULES = [
  {
    label: 'Credential / API key / token',
    test: s => /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/.test(s)
      || /\b(?:password|passwd|secret|api[_-]?key|private[_-]?key|token)\b\s*[:=]\s*['"]?[^\s'"]{8,}/i.test(s)
      || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s),
    why: 'credentials must never leave the machine (CLAUDE.md §4 Security)',
  },
  {
    label: 'Private network address (edge topology)',
    test: s => /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/.test(s),
    why: 'edge/PLC network addresses are manufacturing-confidential (iotpf-git-workflow §6)',
  },
  {
    label: 'MAC address / device serial',
    test: s => /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/.test(s),
    why: 'device identifiers are manufacturing-confidential (iotpf-git-workflow §6)',
  },
  {
    label: 'Plant / line / lot identifier field',
    test: s => /\b(?:plant_?code|line_?id|lot_?(?:no|number)|edge_?id|machine_?serial)\b\s*[:=]\s*['"]?[\w-]+/i.test(s),
    why: 'real plant/line/lot identifiers must stay on-prem (CLAUDE.md §2 data sovereignty)',
  },
  {
    label: 'Bulk numeric series (raw waveform shape)',
    // 40+ comma-separated numbers is sensor-capture shaped, not a search query.
    test: s => /(?:-?\d+(?:\.\d+)?\s*,\s*){40,}-?\d+(?:\.\d+)?/.test(s),
    why: 'raw waveform / sensor series must be analyzed locally (CLAUDE.md §2, Flow B stays on Ollama)',
  },
];

function isExternalMcpTool(toolName) {
  const name = String(toolName || '');
  return EXTERNAL_MCP_PREFIXES.some(p => name.startsWith(p));
}

/** Scan a serialized payload; return matched rules (deduped by label). */
function scanPayload(serialized) {
  const hits = [];
  for (const rule of CONFIDENTIAL_RULES) {
    try {
      if (rule.test(serialized)) hits.push(rule);
    } catch { /* one broken rule must not break the guard */ }
  }
  return hits;
}

function buildBlockMessage(toolName, hits) {
  const lines = [];
  lines.push(`[MCP Egress Guard] BLOCKED — confidential pattern in payload bound for external MCP "${toolName}"`);
  lines.push('');
  lines.push('CLAUDE.md §2 (data sovereignty): never send raw or manufacturing-confidential');
  lines.push('data to an external or cloud service. Detected:');
  for (const h of hits) {
    lines.push(`- **${h.label}** — ${h.why}.`);
  }
  lines.push('');
  lines.push('Remove the confidential content and re-phrase the request as a generic/public query,');
  lines.push('or perform the analysis locally (Flow B deep-dive stays on the local LLM).');
  lines.push('If this is a verified false positive, disable via ECC_DISABLED_HOOKS=pre:mcp:egress-guard.');
  return lines.join('\n');
}

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const toolName = input.tool_name || '';
    if (!isExternalMcpTool(toolName)) return rawInput;

    const serialized = JSON.stringify(input.tool_input || {});
    if (!serialized || serialized === '{}') return rawInput;

    const hits = scanPayload(serialized);
    if (hits.length === 0) return rawInput;

    return { exitCode: 2, stderr: buildBlockMessage(toolName, hits) };
  } catch {
    // Fail open: never block a tool call because of a hook error (CLAUDE.md §7).
  }
  return rawInput;
}

module.exports = { run, isExternalMcpTool, scanPayload };

// stdin entry point for direct / spawned execution
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      raw += chunk.substring(0, MAX_STDIN - raw.length);
    }
  });
  process.stdin.on('end', () => {
    const result = run(raw);
    if (result && typeof result === 'object') {
      if (result.stderr) process.stderr.write(`${result.stderr}\n`);
      process.stdout.write(String(result.stdout || ''));
      process.exit(Number.isInteger(result.exitCode) ? result.exitCode : 0);
    } else {
      process.stdout.write(String(result));
      process.exit(0);
    }
  });
}
