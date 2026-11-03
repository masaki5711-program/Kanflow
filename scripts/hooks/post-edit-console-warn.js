#!/usr/bin/env node
/**
 * PostToolUse Hook: Warn about console.log statements after edits
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs after Edit tool use. If the edited JS/TS file contains console.log
 * statements, warns with line numbers to help remove debug statements
 * before committing.
 */

const { readFile } = require('../lib/utils');

const MAX_STDIN = 1024 * 1024; // 1MB limit

/**
 * Core logic, runnable in-process via run-with-flags.js or as a child process.
 * Parses the raw stdin string, warns to stderr (via console.error) when the
 * edited JS/TS file contains console.log, then returns the raw input unchanged
 * (plain pass-through). Invalid JSON passes through silently. Never blocks.
 *
 * @param {string} rawInput accumulated stdin
 * @returns {string} the raw input, unchanged
 */
function run(rawInput, _opts) {
  const data = typeof rawInput === 'string' ? rawInput : '';
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_input?.file_path;

    if (filePath && /\.(ts|tsx|js|jsx)$/.test(filePath)) {
      const content = readFile(filePath);
      if (!content) { return data; }
      const lines = content.split('\n');
      const matches = [];

      lines.forEach((line, idx) => {
        if (/console\.log/.test(line)) {
          matches.push((idx + 1) + ': ' + line.trim());
        }
      });

      if (matches.length > 0) {
        console.error('[Hook] WARNING: console.log found in ' + filePath);
        matches.slice(0, 5).forEach(m => console.error(m));
        console.error('[Hook] Remove console.log before committing');
      }
    }
  } catch {
    // Invalid input — pass through
  }

  return data;
}

module.exports = { run };

// Direct-invocation behavior, unchanged.
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
