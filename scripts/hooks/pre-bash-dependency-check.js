#!/usr/bin/env node
/**
 * PreToolUse Hook: Dependency Sanity Check
 *
 * Guards against AI-hallucinated packages. Before a package-install command
 * runs, every named package is verified to actually exist in its registry:
 *
 *   npm / pnpm / yarn / bun  add|install <pkg>  -> registry.npmjs.org
 *   pip install <pkg>                           -> pypi.org
 *   cargo add <pkg>                             -> crates.io
 *
 * A package missing from its registry blocks the command (exit 2).
 *
 * Fails OPEN: any network error, timeout, or parse problem passes the command
 * through unblocked — an offline or proxied environment never blocks a real
 * install. Only a confirmed registry 404 turns into a block.
 *
 * Dual mode keeps the exported run() synchronous for bash-hook-dispatcher.js:
 *   - hook mode (default): reads the tool event, checks packages.
 *   - fetch mode (`--fetch <url>`): a self-spawned child that probes one URL.
 *
 * Compatible with bash-hook-dispatcher.js via module.exports.run().
 * Cross-platform (Windows, macOS, Linux).
 */

'use strict';

const https = require('https');
const { spawnSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;
const LOOKUP_TIMEOUT_MS = 5000;
const MAX_PACKAGES = 12;

// --- fetch mode: probe one registry URL; exit 0=exists, 3=missing, 1=unknown ---

function runFetchMode(url) {
  let done = false;
  const exit = code => { if (!done) { done = true; process.exit(code); } };
  try {
    const req = https.get(
      url,
      { timeout: LOOKUP_TIMEOUT_MS, headers: { 'User-Agent': 'ecc-dependency-check' } },
      res => {
        res.resume(); // drain
        if (res.statusCode === 200) exit(0);
        else if (res.statusCode === 404) exit(3);
        else exit(1);
      },
    );
    req.on('timeout', () => { req.destroy(); exit(1); });
    req.on('error', () => exit(1));
  } catch {
    exit(1);
  }
  setTimeout(() => exit(1), LOOKUP_TIMEOUT_MS + 1500);
}

// --- install-command detection ---

const INSTALL_PATTERNS = [
  { eco: 'npm', re: /\b(?:npm|pnpm|bun)\s+(?:i|install|add)\b([^&|;\n]*)/gi },
  { eco: 'npm', re: /\byarn\s+add\b([^&|;\n]*)/gi },
  { eco: 'pip', re: /\b(?:pip3?|python3?\s+-m\s+pip)\s+install\b([^&|;\n]*)/gi },
  { eco: 'cargo', re: /\bcargo\s+add\b([^&|;\n]*)/gi },
];

// Flags that consume the following token as their value (not a package).
const VALUE_FLAGS = new Set(['-r', '--requirement', '-c', '--constraint', '-e', '--editable']);
const SKIP_EXT = /\.(txt|toml|cfg|json|lock|md|ini|whl|tar|gz)$/i;

function cleanPackageName(token) {
  let name = token;
  if (name.startsWith('@')) {
    const slash = name.indexOf('/');
    if (slash !== -1) {
      const at = name.indexOf('@', slash);
      if (at !== -1) name = name.slice(0, at);
    }
  } else {
    const at = name.indexOf('@');
    if (at > 0) name = name.slice(0, at);
  }
  name = name.split(/[=<>!~;[\]( )]/)[0]; // strip pip/cargo version specifiers
  return name.trim();
}

function extractPackages(argsStr, eco) {
  const tokens = String(argsStr || '').trim().split(/\s+/).filter(Boolean);
  const pkgs = [];
  let skipNext = false;
  for (const token of tokens) {
    if (skipNext) { skipNext = false; continue; }
    if (token.startsWith('-')) {
      if (VALUE_FLAGS.has(token)) skipNext = true;
      continue;
    }
    if (/[/\\]/.test(token) || /^[a-z]+\+?https?:/i.test(token) || token === '.' || token === '..') continue;
    if (SKIP_EXT.test(token)) continue;
    const name = cleanPackageName(token);
    if (!name || !/^@?[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) continue;
    pkgs.push({ eco, pkg: name });
  }
  return pkgs;
}

function registryUrl(eco, pkg) {
  if (eco === 'npm') {
    const enc = pkg.startsWith('@') ? pkg.replace('/', '%2F') : encodeURIComponent(pkg);
    return `https://registry.npmjs.org/${enc}`;
  }
  if (eco === 'pip') return `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
  if (eco === 'cargo') return `https://crates.io/api/v1/crates/${encodeURIComponent(pkg)}`;
  return null;
}

/** Synchronous existence probe via a self-spawned child process. */
function probe(url) {
  const res = spawnSync(process.execPath, [__filename, '--fetch', url], {
    timeout: LOOKUP_TIMEOUT_MS + 3000,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.error || res.status === null) return 'unknown';
  if (res.status === 0) return 'exists';
  if (res.status === 3) return 'missing';
  return 'unknown';
}

function collectPackages(command) {
  const all = [];
  for (const { eco, re } of INSTALL_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(command)) !== null) {
      all.push(...extractPackages(m[1], eco));
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  const seen = new Set();
  const out = [];
  for (const p of all) {
    const key = `${p.eco}|${p.pkg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, MAX_PACKAGES);
}

function buildBlockMessage(missing) {
  const lines = [
    '[Dependency Sanity Check] BLOCKED — package(s) not found in their registry',
    '',
  ];
  for (const { eco, pkg } of missing) {
    const reg = eco === 'npm' ? 'the npm registry' : eco === 'pip' ? 'PyPI' : 'crates.io';
    lines.push(`  - "${pkg}" does not exist on ${reg}.`);
  }
  lines.push('');
  lines.push('A non-existent package name is a likely hallucination. Verify the exact name');
  lines.push('against the official documentation / registry, then retry. If the name is');
  lines.push('correct and this is a private/internal package, disable this gate via');
  lines.push('ECC_DISABLED_HOOKS=pre:bash:dependency-check.');
  return lines.join('\n');
}

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const command = String(input.tool_input?.command || '');
    if (!command) return rawInput;

    const packages = collectPackages(command);
    if (packages.length === 0) return rawInput;

    // Network probing can be disabled with ECC_DEPCHECK_OFFLINE=1 for
    // air-gapped sites, CI, and tests — skip the registry lookup and pass
    // through. This is the same fail-open outcome as an unreachable network,
    // and keeps the test suite deterministic and fast (no live registry I/O).
    if (process.env.ECC_DEPCHECK_OFFLINE === '1') return rawInput;

    const missing = [];
    for (const { eco, pkg } of packages) {
      const url = registryUrl(eco, pkg);
      if (!url) continue;
      if (probe(url) === 'missing') missing.push({ eco, pkg });
    }
    if (missing.length > 0) {
      return { exitCode: 2, stderr: buildBlockMessage(missing) };
    }
  } catch {
    // fail open — never block because of a hook error
  }
  return rawInput;
}

module.exports = { run };

// --- entry points ---

const fetchIdx = process.argv.indexOf('--fetch');
if (fetchIdx !== -1 && process.argv[fetchIdx + 1]) {
  runFetchMode(process.argv[fetchIdx + 1]);
} else if (require.main === module) {
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
