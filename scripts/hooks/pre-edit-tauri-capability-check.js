#!/usr/bin/env node
/**
 * PreToolUse Hook: Tauri Capability Least-Privilege Gate
 *
 * When a Tauri permission surface is created or edited (a file under
 * capabilities/ or tauri.conf.json) with an over-broad grant — wildcard fs
 * scopes, blanket shell execution, wildcard remote URLs, or a disabled CSP —
 * this hook blocks ONCE per file per session and asks Claude to justify or
 * narrow the scope (least privilege, `tauri-patterns` skill). Retrying the
 * same edit passes, so a deliberate broad scope is never hard-blocked.
 *
 * Fails OPEN: any parse error passes through. Disable with
 * ECC_DISABLED_HOOKS=pre:edit:tauri-capability-check.
 *
 * Compatible with run-with-flags.js via module.exports.run().
 * Cross-platform (Windows, macOS, Linux).
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_STDIN = 1024 * 1024;
const TAURI_FILE = /(tauri\.conf(\.[\w-]+)?\.json|[\\/]capabilities[\\/][^\\/]+\.(json|toml))$/i;

// Each risky grant: pattern over the NEW content + why it is flagged.
const RISKY_GRANTS = [
  {
    pattern: /"shell:(allow-execute|allow-spawn|default)"/,
    reason: 'shell execution permission — arbitrary process launch surface; prefer a sidecar with fixed args, or scope the command allowlist tightly',
  },
  {
    pattern: /"(\$[A-Z_]+[\\/])?\*\*(\/\*)?"/,
    reason: 'wildcard filesystem scope ("**") — grant specific directories instead (e.g. "$APPDATA/myapp/**")',
  },
  {
    pattern: /"urls?"\s*:\s*\[[^\]]*"(\*|https?:\/\/\*)"/,
    reason: 'wildcard remote URL scope — enumerate the exact origins the webview may reach',
  },
  {
    pattern: /"csp"\s*:\s*null/,
    reason: 'CSP disabled — keep a Content-Security-Policy; a null CSP removes the main XSS→IPC escalation barrier',
  },
];

function stateFile() {
  const raw =
    process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `ecc-tauri-cap-${id}.json`);
}

function firedSet() {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    return new Set(Array.isArray(parsed.files) ? parsed.files : []);
  } catch {
    return new Set();
  }
}

function markFired(set, file) {
  try {
    set.add(file);
    fs.writeFileSync(stateFile(), JSON.stringify({ files: [...set], ts: Date.now() }), 'utf8');
  } catch {
    /* best-effort */
  }
}

/** Collect {file, content} pairs of Tauri permission files in the tool input. */
function tauriEdits(input) {
  const ti = input.tool_input || {};
  const out = [];
  const push = (file, content) => {
    if (typeof file === 'string' && TAURI_FILE.test(file)) {
      out.push({ file, content: String(content || '') });
    }
  };
  push(ti.file_path, ti.content !== undefined ? ti.content : ti.new_string);
  if (Array.isArray(ti.edits)) {
    for (const e of ti.edits) {
      if (e) push(e.file_path || ti.file_path, e.new_string);
    }
  }
  return out;
}

function findRisks(content) {
  return RISKY_GRANTS.filter(g => g.pattern.test(content)).map(g => g.reason);
}

function buildMessage(file, reasons) {
  return [
    '[Tauri Capability Gate] This edit grants a BROAD permission in a Tauri security surface:',
    `  ${file}`,
    '',
    ...reasons.map(r => `  - ${r}`),
    '',
    'Capabilities are the security boundary of a Tauri app (the frontend is untrusted).',
    'Apply least privilege per the `tauri-patterns` skill, or — if the broad scope is',
    'genuinely required — state the justification and retry the edit (this gate fires',
    'only once per file per session). Consider a `tauri-reviewer` pass before commit.',
  ].join('\n');
}

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    for (const { file, content } of tauriEdits(input)) {
      const reasons = findRisks(content);
      if (reasons.length === 0) continue;
      const fired = firedSet();
      const key = file.replace(/\\/g, '/').toLowerCase();
      if (fired.has(key)) continue; // already surfaced this session -> pass
      markFired(fired, key);
      return { exitCode: 2, stderr: buildMessage(file, reasons) };
    }
  } catch {
    // fail open — never block because of a hook error
  }
  return rawInput;
}

module.exports = { run, findRisks, tauriEdits };

// stdin entry point for direct / spawned execution
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
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
