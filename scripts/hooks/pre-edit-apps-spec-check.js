#!/usr/bin/env node
/**
 * PreToolUse Hook: apps/ References Gate  (hook id: pre:edit:apps-spec-check)
 *
 * The first time a file under an apps/ AREA (edge / hub / ai / dashboard /
 * other) is created or edited in a session, this hook blocks once FOR THAT
 * AREA and reminds Claude to consult the product's reference material BEFORE
 * building anything in the product tree.
 *
 * Agent-model v3 (2026-08-13): the single living `spec.md` was replaced by a
 * rich reference directory per product checkout:
 *   apps/<project>/references/
 *     README.md      — human/model index of what is where
 *     manifest.json  — machine-readable area status:
 *                        { "areas": { "<area>": { "status": "decided"|"undecided",
 *                                                  "paths": ["specs/...", ...] } } }
 *     decisions.md   — decision log (updated in the same change set as any
 *                      change that alters the agreed spec)
 *     specs/ code/ tests/ html/ … — the reference material itself, read
 *                      ON DEMAND by the model (never inlined by this hook)
 *
 * The hook enumerates the area's reference paths from manifest.json — it
 * NEVER reads reference content into the block message (on-demand reading is
 * the point of the model). Area status "undecided" produces the explicit
 * UNDECIDED warning that `未決` markers in spec.md used to produce.
 *
 * Per-area once-per-session (a state file records fired areas). Edits inside
 * references/ itself (and to a legacy spec.md) never trigger the gate —
 * updating the reference material must never be blocked by this gate.
 *
 * Fails OPEN: any parse error passes through. Disable with
 * ECC_DISABLED_HOOKS=pre:edit:apps-spec-check.
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
const MAX_LISTED_PATHS = 8;
// apps/... anywhere in the path, forward or back slashes.
const APPS_RE = /(^|[\\/])apps[\\/]/i;
// Never gate the reference material itself: apps/[<project>/]references/**.
const REFS_RE = /(^|[\\/])apps[\\/](?:[^\\/]+[\\/])?references[\\/]/i;
// Legacy spec.md files (pre-v3 layout) are also exempt.
const SPEC_RE = /(^|[\\/])apps[\\/](?:[^\\/]+[\\/])?spec\.md$/i;

function stateFile() {
  const raw =
    process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `ecc-apps-spec-${id}.json`);
}

function readState() {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    // Legacy shape ({fired:true}) counts as the generic area having fired.
    if (state.fired === true && !state.firedAreas) return { firedAreas: { apps: state.ts || 1 } };
    return { firedAreas: state.firedAreas || {} };
  } catch {
    return { firedAreas: {} };
  }
}

function alreadyFired(area) {
  return Boolean(readState().firedAreas[area]);
}

function markFired(area) {
  try {
    const state = readState();
    state.firedAreas[area] = Date.now();
    fs.writeFileSync(stateFile(), JSON.stringify(state), 'utf8');
  } catch {
    /* best-effort */
  }
}

// ── Area detection ──────────────────────────────────────────────────────────

// Layer dirs may sit directly under apps/ (legacy) or under a product
// checkout apps/<project>/ (workspace model) — the segment is optional.
const AREAS = [
  { area: 'edge', re: /(^|[\\/])apps[\\/](?:[^\\/]+[\\/])?edge[\\/]/i },
  { area: 'hub', re: /(^|[\\/])apps[\\/](?:[^\\/]+[\\/])?hub[\\/]/i },
  { area: 'ai', re: /(^|[\\/])apps[\\/](?:[^\\/]+[\\/])?ai[\\/]/i },
  { area: 'dashboard', re: /(^|[\\/])apps[\\/](?:[^\\/]+[\\/])?dashboard[\\/]/i },
];

function areaOf(file) {
  const hit = AREAS.find(a => a.re.test(file));
  return hit ? { area: hit.area } : { area: 'apps' };
}

/**
 * Resolve the references/ directory governing an edited apps/ file: the
 * product checkout's own apps/<project>/references/ when it exists, else the
 * legacy apps/references/.
 */
function referencesDirFor(file) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const m = String(file || '').replace(/\\/g, '/').match(/(?:^|\/)apps\/([^/]+)\//i);
  if (m) {
    const candidate = path.join(root, 'apps', m[1], 'references');
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(root, 'apps', 'references');
}

/**
 * Read the governing manifest.json and return the area's entry
 * ({status, paths} or null). Fail-open: unreadable manifest → null.
 */
function manifestAreaEntry(area, file) {
  try {
    const manifestPath = path.join(referencesDirFor(file), 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const areas = manifest && typeof manifest === 'object' ? manifest.areas : null;
    const entry = areas && typeof areas === 'object' ? areas[area] : null;
    return entry && typeof entry === 'object' ? entry : null;
  } catch {
    return null;
  }
}

function areaUndecided(entry) {
  return Boolean(entry && entry.status === 'undecided');
}

/** Area reference paths for enumeration in the message (paths only, capped). */
function areaListedPaths(entry) {
  if (!entry || !Array.isArray(entry.paths)) return [];
  return entry.paths.filter(p => typeof p === 'string' && p.length > 0).slice(0, MAX_LISTED_PATHS);
}

/** Return the first gated apps/ file path in the tool input, or null. */
function appsFilePath(input) {
  const ti = input.tool_input || {};
  const paths = [];
  if (typeof ti.file_path === 'string') paths.push(ti.file_path);
  if (Array.isArray(ti.edits)) {
    for (const e of ti.edits) {
      if (e && typeof e.file_path === 'string') paths.push(e.file_path);
    }
  }
  return paths.find(p => APPS_RE.test(p) && !REFS_RE.test(p) && !SPEC_RE.test(p)) || null;
}

function buildMessage(file, areaInfo, entry) {
  const lines = [
    '[apps/ References Gate] You are about to create or edit a product-tree file:',
    `  ${file}`,
    '',
  ];
  if (areaUndecided(entry)) {
    lines.push(
      `*** references/manifest.json marks area "${areaInfo.area}" as UNDECIDED. ***`,
      'Do NOT implement functional scope for this area. Settle the concept with the',
      'user (AskUserQuestion) and record the decision in `references/decisions.md`',
      '(and flip the manifest status) first. Structure-only scaffolding is allowed',
      'but its README must say the scope is undecided.',
      '',
    );
  }
  lines.push(
    'Before building anything under apps/, consult the reference material:',
    '  1. Read the governing `references/README.md` — the index of specs, code',
    '     samples, tests, and HTML mocks for this product',
    '     (`apps/<project>/references/` for a product checkout).',
  );
  const listed = areaListedPaths(entry);
  if (listed.length > 0) {
    lines.push(`  2. Reference material declared for area "${areaInfo.area}" (read on demand):`);
    for (const p of listed) lines.push(`       - ${p}`);
  } else {
    lines.push(
      `  2. No reference material is declared for area "${areaInfo.area}" in`,
      '     manifest.json — treat the scope as unconfirmed and check with the user',
      '     before inventing behavior.',
    );
  }
  lines.push(
    '  3. If this change ALTERS the agreed spec, update `references/decisions.md`',
    '     in the same change set (decision drift is a review finding).',
    '  4. DB work: load `.claude/rules/iotpf-pfs-data-model.md`; PFE work: follow',
    '     the `pfe-edge-mcp-toolset` skill (Tier-1 classes incl. local-only tables).',
    '',
    `Once the references are consulted, retry the edit (this gate fires once per session per area — area: ${areaInfo.area}).`,
  );
  return lines.join('\n');
}

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const file = appsFilePath(input);
    if (!file) return rawInput; // not a gated apps/ product file
    const areaInfo = areaOf(file);
    if (alreadyFired(areaInfo.area)) return rawInput; // this area was consulted this session
    markFired(areaInfo.area);
    return { exitCode: 2, stderr: buildMessage(file, areaInfo, manifestAreaEntry(areaInfo.area, file)) };
  } catch {
    // fail open — never block because of a hook error
  }
  return rawInput;
}

module.exports = { run };

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
