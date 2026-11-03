#!/usr/bin/env node

/**
 * Stop Hook: Check for console.log statements in modified files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs after each response and checks if any modified JavaScript/TypeScript
 * files contain console.log statements. Provides warnings to help developers
 * remember to remove debug statements before committing.
 *
 * Exclusions: test files, config files, and scripts/ directory (where
 * console.log is often intentional).
 */

const fs = require('fs');
const { isGitRepo, getGitModifiedFiles, readFile, log } = require('../lib/utils');

// Files where console.log is expected and should not trigger warnings
const EXCLUDED_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]s$/,
  /scripts\//,
  /__tests__\//,
  /__mocks__\//,
];

const MAX_STDIN = 1024 * 1024; // 1MB limit

/**
 * Core logic, runnable in-process via run-with-flags.js or as a child process.
 * Operates on the raw stdin string and ALWAYS returns the raw input unchanged
 * (plain pass-through). Warnings are emitted to stderr via log() as a side
 * effect, mirroring the original behavior. Never blocks (exit 0 / pass-through).
 *
 * @param {string} rawInput accumulated stdin
 * @returns {string} the raw input, unchanged
 */
function run(rawInput, _opts) {
  const data = typeof rawInput === 'string' ? rawInput : '';
  try {
    if (!isGitRepo()) {
      return data;
    }

    const files = getGitModifiedFiles(['\\.tsx?$', '\\.jsx?$'])
      .filter(f => fs.existsSync(f))
      .filter(f => !EXCLUDED_PATTERNS.some(pattern => pattern.test(f)));

    let hasConsole = false;

    for (const file of files) {
      const content = readFile(file);
      if (content && content.includes('console.log')) {
        log(`[Hook] WARNING: console.log found in ${file}`);
        hasConsole = true;
      }
    }

    if (hasConsole) {
      log('[Hook] Remove console.log statements before committing');
    }
  } catch (err) {
    log(`[Hook] check-console-log error: ${err.message}`);
  }

  // Always output the original data
  return data;
}

module.exports = { run, EXCLUDED_PATTERNS };

// Direct-invocation behavior, unchanged: read stdin, run, echo input, exit 0.
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      const remaining = MAX_STDIN - data.length;
      data += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    process.stdout.write(run(data));
    process.exit(0);
  });

  process.stdin.on('error', () => process.exit(0));
}
