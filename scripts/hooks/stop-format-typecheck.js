#!/usr/bin/env node
/**
 * Stop Hook: Batch format, lint, and typecheck all files edited this response
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Reads the accumulator written by post-edit-accumulator.js and processes all
 * edited files in one pass:
 *   - groups JS/TS/CSS files by project root for a single formatter invocation
 *     per root (Biome or Prettier)
 *   - groups .ts/.tsx/.js/.jsx files by the nearest ESLint config root for a
 *     single `eslint --fix` per root (skipped where Biome owns linting)
 *   - groups .css/.scss/.sass/.less files by the nearest Stylelint config root
 *     for a single `stylelint --fix` per root
 *   - groups .ts/.tsx files by tsconfig dir for a single tsc --noEmit per
 *     tsconfig
 *   - groups .rs files by the nearest Cargo.toml (crate root) for a single
 *     `cargo clippy` diagnostic pass per crate (formatting is already handled
 *     per-edit by quality-gate.js's rustfmt branch)
 *   - groups .py files by the nearest pyproject.toml/setup.cfg/tox.ini/
 *     pytest.ini for a single `ruff check` diagnostic pass per project
 *     (formatting is already handled per-edit by quality-gate.js's ruff
 *     format branch)
 * The accumulator is cleared on read so repeated Stop calls do not
 * double-process files.
 *
 * Per-batch timeout is proportional to the number of batches so the total
 * never exceeds the Stop hook budget (90 s reserved for overhead).
 */

'use strict';

const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { findProjectRoot, detectFormatter, resolveFormatterBin } = require('../lib/resolve-formatter');

const MAX_STDIN = 1024 * 1024;
// Total ms budget reserved for all batches (leaves headroom below the 300s Stop timeout)
const TOTAL_BUDGET_MS = 270_000;

// Characters cmd.exe treats as separators/operators when shell: true is used.
// Includes spaces and parentheses to guard paths like "C:\Users\John Doe\...".
const UNSAFE_PATH_CHARS = /[&|<>^%!\s()]/;

/** Parse the accumulator text into a deduplicated array of file paths. */
function parseAccumulator(raw) {
  return [...new Set(raw.split('\n').map(l => l.trim()).filter(Boolean))];
}

function getAccumFile() {
  const raw =
    process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  const sessionId = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `ecc-edited-${sessionId}.txt`);
}

function formatBatch(projectRoot, files, timeoutMs) {
  const formatter = detectFormatter(projectRoot);
  if (!formatter) return;

  const resolved = resolveFormatterBin(projectRoot, formatter);
  if (!resolved) return;

  const existingFiles = files.filter(f => fs.existsSync(f));
  if (existingFiles.length === 0) return;

  const fileArgs =
    formatter === 'biome'
      ? [...resolved.prefix, 'check', '--write', ...existingFiles]
      : [...resolved.prefix, '--write', ...existingFiles];

  try {
    if (process.platform === 'win32' && resolved.bin.endsWith('.cmd')) {
      if (existingFiles.some(f => UNSAFE_PATH_CHARS.test(f))) {
        process.stderr.write('[Hook] stop-format-typecheck: skipping batch — unsafe path chars\n');
        return;
      }
      const result = spawnSync(resolved.bin, fileArgs, { cwd: projectRoot, shell: true, stdio: 'pipe', timeout: timeoutMs });
      if (result.error) throw result.error;
    } else {
      execFileSync(resolved.bin, fileArgs, { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs });
    }
  } catch {
    // Formatter not installed or failed — non-blocking
  }
}

function findTsConfigDir(filePath) {
  let dir = path.dirname(filePath);
  const fsRoot = path.parse(dir).root;
  let depth = 0;
  while (dir !== fsRoot && depth < 20) {
    if (fs.existsSync(path.join(dir, 'tsconfig.json'))) return dir;
    dir = path.dirname(dir);
    depth++;
  }
  return null;
}

const ESLINT_CONFIGS = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml'
];

const STYLELINT_CONFIGS = [
  '.stylelintrc', '.stylelintrc.json', '.stylelintrc.js', '.stylelintrc.cjs',
  '.stylelintrc.yml', '.stylelintrc.yaml', 'stylelint.config.js', 'stylelint.config.cjs'
];

function hasPackageJsonKey(dir, key) {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return Object.prototype.hasOwnProperty.call(pkg, key);
  } catch {
    return false;
  }
}

/** Walk up from `filePath`'s directory to the nearest dir with the given
 * config file list or package.json key. Returns null if none is found. */
function findConfigRoot(filePath, configs, pkgKey) {
  let dir = path.dirname(filePath);
  const fsRoot = path.parse(dir).root;
  let depth = 0;
  while (dir !== fsRoot && depth < 20) {
    if (configs.some(cfg => fs.existsSync(path.join(dir, cfg)))) return dir;
    if (pkgKey && hasPackageJsonKey(dir, pkgKey)) return dir;
    dir = path.dirname(dir);
    depth++;
  }
  return null;
}

function usesBiome(dir) {
  return fs.existsSync(path.join(dir, 'biome.json')) || fs.existsSync(path.join(dir, 'biome.jsonc'));
}

/** Resolve the local node_modules/.bin binary for `binName`, or null. */
function resolveLocalBin(root, binName) {
  const isWin = process.platform === 'win32';
  const bin = path.join(root, 'node_modules', '.bin', isWin ? `${binName}.cmd` : binName);
  return fs.existsSync(bin) ? bin : null;
}

function lintBatch(eslintRoot, files, timeoutMs) {
  if (usesBiome(eslintRoot)) return; // Biome's `check --write` already lints
  const bin = resolveLocalBin(eslintRoot, 'eslint');
  if (!bin) return;

  const existingFiles = files.filter(f => fs.existsSync(f));
  if (existingFiles.length === 0) return;

  try {
    if (process.platform === 'win32') {
      if (existingFiles.some(f => UNSAFE_PATH_CHARS.test(f))) {
        process.stderr.write('[Hook] stop-format-typecheck: skipping eslint batch — unsafe path chars\n');
        return;
      }
      const result = spawnSync(bin, ['--fix', ...existingFiles], { cwd: eslintRoot, shell: true, stdio: 'pipe', timeout: timeoutMs });
      if (result.error) throw result.error;
    } else {
      execFileSync(bin, ['--fix', ...existingFiles], { cwd: eslintRoot, stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs });
    }
  } catch (err) {
    // ESLint exits non-zero on unfixable findings — surface, don't block
    const output = ((err && err.stdout) || '') + ((err && err.stderr) || '');
    if (output.trim()) {
      process.stderr.write(`[Hook] ESLint findings:\n${output.trim().slice(0, 2000)}\n`);
    }
  }
}

function stylelintBatch(stylelintRoot, files, timeoutMs) {
  const bin = resolveLocalBin(stylelintRoot, 'stylelint');
  if (!bin) return;

  const existingFiles = files.filter(f => fs.existsSync(f));
  if (existingFiles.length === 0) return;

  try {
    if (process.platform === 'win32') {
      if (existingFiles.some(f => UNSAFE_PATH_CHARS.test(f))) {
        process.stderr.write('[Hook] stop-format-typecheck: skipping stylelint batch — unsafe path chars\n');
        return;
      }
      const result = spawnSync(bin, ['--fix', ...existingFiles], { cwd: stylelintRoot, shell: true, stdio: 'pipe', timeout: timeoutMs });
      if (result.error) throw result.error;
    } else {
      execFileSync(bin, ['--fix', ...existingFiles], { cwd: stylelintRoot, stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs });
    }
  } catch (err) {
    const output = ((err && err.stdout) || '') + ((err && err.stderr) || '');
    if (output.trim()) {
      process.stderr.write(`[Hook] Stylelint findings:\n${output.trim().slice(0, 2000)}\n`);
    }
  }
}

function typecheckBatch(tsConfigDir, editedFiles, timeoutMs) {
  const isWin = process.platform === 'win32';
  const npxBin = isWin ? 'npx.cmd' : 'npx';
  const args = ['tsc', '--noEmit', '--pretty', 'false'];
  const opts = { cwd: tsConfigDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs };

  let stdout = '';
  let stderr = '';
  let failed = false;

  try {
    if (isWin) {
      // .cmd files require shell: true on Windows
      const result = spawnSync(npxBin, args, { ...opts, shell: true });
      if (result.error) return; // timed out or not found — non-blocking
      if (result.status !== 0) {
        stdout = result.stdout || '';
        stderr = result.stderr || '';
        failed = true;
      }
    } else {
      execFileSync(npxBin, args, opts);
    }
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    failed = true;
  }

  if (!failed) return;

  const lines = (stdout + stderr).split('\n');
  for (const filePath of editedFiles) {
    const relPath = path.relative(tsConfigDir, filePath);
    const candidates = new Set([filePath, relPath]);
    const relevantLines = lines
      .filter(line => { for (const c of candidates) { if (line.includes(c)) return true; } return false; })
      .slice(0, 10);
    if (relevantLines.length > 0) {
      process.stderr.write(`[Hook] TypeScript errors in ${path.basename(filePath)}:\n`);
      relevantLines.forEach(line => process.stderr.write(line + '\n'));
    }
  }
}

/** Walk up from `filePath`'s directory to the nearest dir containing Cargo.toml. */
function findCargoRoot(filePath) {
  let dir = path.dirname(filePath);
  const fsRoot = path.parse(dir).root;
  let depth = 0;
  while (dir !== fsRoot && depth < 20) {
    if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return dir;
    dir = path.dirname(dir);
    depth++;
  }
  return null;
}

const PYPROJECT_MARKERS = ['pyproject.toml', 'setup.cfg', 'tox.ini', 'pytest.ini'];

/** Walk up from `filePath`'s directory to the nearest Python project marker. */
function findPyProjectRoot(filePath) {
  let dir = path.dirname(filePath);
  const fsRoot = path.parse(dir).root;
  let depth = 0;
  while (dir !== fsRoot && depth < 20) {
    if (PYPROJECT_MARKERS.some(m => fs.existsSync(path.join(dir, m)))) return dir;
    dir = path.dirname(dir);
    depth++;
  }
  return null;
}

/** Diagnostic-only (no --fix): surfaces findings without mutating code. */
function clippyBatch(cargoRoot, editedFiles, timeoutMs) {
  const isWin = process.platform === 'win32';
  const args = ['clippy', '--quiet', '--message-format=short'];
  const opts = { cwd: cargoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs };

  let stdout = '';
  let stderr = '';
  let failed = false;

  try {
    if (isWin) {
      const result = spawnSync('cargo', args, opts);
      if (result.error) return; // cargo not installed — non-blocking
      if (result.status !== 0) {
        stdout = result.stdout || '';
        stderr = result.stderr || '';
        failed = true;
      }
    } else {
      execFileSync('cargo', args, opts);
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') return; // cargo not installed
    stdout = (err && err.stdout) || '';
    stderr = (err && err.stderr) || '';
    failed = true;
  }

  if (!failed) return;

  const lines = (stdout + stderr).split('\n');
  for (const filePath of editedFiles) {
    const relPath = path.relative(cargoRoot, filePath);
    const relevantLines = lines.filter(line => line.includes(relPath)).slice(0, 10);
    if (relevantLines.length > 0) {
      process.stderr.write(`[Hook] Clippy findings in ${path.basename(filePath)}:\n`);
      relevantLines.forEach(line => process.stderr.write(line + '\n'));
    }
  }
}

/** Diagnostic-only (no --fix): surfaces findings without mutating code. */
function ruffCheckBatch(pyRoot, editedFiles, timeoutMs) {
  const existingFiles = editedFiles.filter(f => fs.existsSync(f));
  if (existingFiles.length === 0) return;

  try {
    if (process.platform === 'win32') {
      if (existingFiles.some(f => UNSAFE_PATH_CHARS.test(f))) {
        process.stderr.write('[Hook] stop-format-typecheck: skipping ruff batch — unsafe path chars\n');
        return;
      }
      const result = spawnSync('ruff', ['check', ...existingFiles], { cwd: pyRoot, shell: true, stdio: 'pipe', timeout: timeoutMs });
      if (result.error) return; // ruff not installed — non-blocking
      const output = (result.stdout || '') + (result.stderr || '');
      if (result.status !== 0 && output.trim()) {
        process.stderr.write(`[Hook] Ruff findings:\n${output.trim().slice(0, 2000)}\n`);
      }
    } else {
      execFileSync('ruff', ['check', ...existingFiles], { cwd: pyRoot, stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs });
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') return; // ruff not installed
    const output = ((err && err.stdout) || '') + ((err && err.stderr) || '');
    if (output.trim()) {
      process.stderr.write(`[Hook] Ruff findings:\n${output.trim().slice(0, 2000)}\n`);
    }
  }
}

function main() {
  const accumFile = getAccumFile();

  let raw;
  try {
    raw = fs.readFileSync(accumFile, 'utf8');
  } catch {
    return; // No accumulator — nothing edited this response
  }

  try { fs.unlinkSync(accumFile); } catch { /* best-effort */ }

  const files = parseAccumulator(raw);
  if (files.length === 0) return;

  const byProjectRoot = new Map();
  for (const filePath of files) {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) continue;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    const root = findProjectRoot(path.dirname(resolved));
    if (!byProjectRoot.has(root)) byProjectRoot.set(root, []);
    byProjectRoot.get(root).push(resolved);
  }

  const byTsConfigDir = new Map();
  for (const filePath of files) {
    if (!/\.(ts|tsx)$/.test(filePath)) continue;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    const tsDir = findTsConfigDir(resolved);
    if (!tsDir) continue;
    if (!byTsConfigDir.has(tsDir)) byTsConfigDir.set(tsDir, []);
    byTsConfigDir.get(tsDir).push(resolved);
  }

  const byEslintRoot = new Map();
  for (const filePath of files) {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) continue;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    const root = findConfigRoot(resolved, ESLINT_CONFIGS, 'eslintConfig');
    if (!root) continue;
    if (!byEslintRoot.has(root)) byEslintRoot.set(root, []);
    byEslintRoot.get(root).push(resolved);
  }

  const byStylelintRoot = new Map();
  for (const filePath of files) {
    if (!/\.(css|scss|sass|less)$/.test(filePath)) continue;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    const root = findConfigRoot(resolved, STYLELINT_CONFIGS, 'stylelint');
    if (!root) continue;
    if (!byStylelintRoot.has(root)) byStylelintRoot.set(root, []);
    byStylelintRoot.get(root).push(resolved);
  }

  const byCargoRoot = new Map();
  for (const filePath of files) {
    if (!/\.rs$/.test(filePath)) continue;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    const root = findCargoRoot(resolved);
    if (!root) continue;
    if (!byCargoRoot.has(root)) byCargoRoot.set(root, []);
    byCargoRoot.get(root).push(resolved);
  }

  const byPyProjectRoot = new Map();
  for (const filePath of files) {
    if (!/\.py$/.test(filePath)) continue;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    const root = findPyProjectRoot(resolved);
    if (!root) continue;
    if (!byPyProjectRoot.has(root)) byPyProjectRoot.set(root, []);
    byPyProjectRoot.get(root).push(resolved);
  }

  // Distribute the budget evenly across all batches so the cumulative total
  // stays within the Stop hook wall-clock limit even in large monorepos.
  const totalBatches =
    byProjectRoot.size + byTsConfigDir.size + byEslintRoot.size + byStylelintRoot.size +
    byCargoRoot.size + byPyProjectRoot.size;
  const perBatchMs = totalBatches > 0 ? Math.floor(TOTAL_BUDGET_MS / totalBatches) : 60_000;

  for (const [root, batch] of byProjectRoot) formatBatch(root, batch, perBatchMs);
  for (const [tsDir, batch] of byTsConfigDir) typecheckBatch(tsDir, batch, perBatchMs);
  for (const [root, batch] of byEslintRoot) lintBatch(root, batch, perBatchMs);
  for (const [root, batch] of byStylelintRoot) stylelintBatch(root, batch, perBatchMs);
  for (const [root, batch] of byCargoRoot) clippyBatch(root, batch, perBatchMs);
  for (const [root, batch] of byPyProjectRoot) ruffCheckBatch(root, batch, perBatchMs);
}

/**
 * Exported so run-with-flags.js uses require() instead of spawnSync,
 * letting the 300s hooks.json timeout govern the full batch.
 *
 * @param {string} rawInput - Raw JSON string from stdin (Stop event payload)
 * @returns {string} The original input (pass-through)
 */
function run(rawInput) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`[Hook] stop-format-typecheck error: ${err.message}\n`);
  }
  return rawInput;
}

if (require.main === module) {
  let stdinData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (stdinData.length < MAX_STDIN) stdinData += chunk.substring(0, MAX_STDIN - stdinData.length);
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(stdinData));
    process.exit(0);
  });
}

module.exports = { run, parseAccumulator };
