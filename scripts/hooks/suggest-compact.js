#!/usr/bin/env node
/**
 * Strategic Compact Suggester
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs on PreToolUse or periodically to suggest manual compaction at logical intervals
 *
 * Why manual over auto-compact:
 * - Auto-compact happens at arbitrary points, often mid-task
 * - Strategic compacting preserves context through logical phases
 * - Compact after exploration, before execution
 * - Compact after completing a milestone, before starting next
 */

const fs = require('fs');
const path = require('path');
const {
  getTempDir,
  writeFile,
  log
} = require('../lib/utils');

/**
 * Core logic, runnable in-process via run-with-flags.js or as a child process.
 *
 * This hook is NOT stdin-driven: it increments a per-session tool-call counter
 * file and emits a /compact suggestion to stderr (via log()) at thresholds. It
 * never blocks. The raw stdin string is ignored and returned unchanged so the
 * wrapper passes the payload through (exit 0).
 *
 * @param {string} [rawInput] accumulated stdin (ignored; passed through)
 * @returns {string} the raw input, unchanged
 */
function suggestCompact(rawInput) {
  const data = typeof rawInput === 'string' ? rawInput : '';

  // Track tool call count (increment in a temp file)
  // Use a session-specific counter file based on session ID from environment
  // or parent PID as fallback
  const sessionId = (process.env.CLAUDE_SESSION_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const counterFile = path.join(getTempDir(), `claude-tool-count-${sessionId}`);
  const rawThreshold = parseInt(process.env.COMPACT_THRESHOLD || '50', 10);
  const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 10000
    ? rawThreshold
    : 50;

  let count = 1;

  // Read existing count or start at 1
  // Use fd-based read+write to reduce (but not eliminate) race window
  // between concurrent hook invocations
  try {
    const fd = fs.openSync(counterFile, 'a+');
    try {
      const buf = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, buf, 0, 64, 0);
      if (bytesRead > 0) {
        const parsed = parseInt(buf.toString('utf8', 0, bytesRead).trim(), 10);
        // Clamp to reasonable range — corrupted files could contain huge values
        // that pass Number.isFinite() (e.g., parseInt('9'.repeat(30)) => 1e+29)
        count = (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000000)
          ? parsed + 1
          : 1;
      }
      // Truncate and write new value
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, String(count), 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Fallback: just use writeFile if fd operations fail
    writeFile(counterFile, String(count));
  }

  // Suggest compact after threshold tool calls
  if (count === threshold) {
    log(`[StrategicCompact] ${threshold} tool calls reached - consider /compact if transitioning phases`);
  }

  // Suggest at regular intervals after threshold (every 25 calls from threshold)
  if (count > threshold && (count - threshold) % 25 === 0) {
    log(`[StrategicCompact] ${count} tool calls - good checkpoint for /compact if context is stale`);
  }

  return data;
}

/**
 * run() wrapper for run-with-flags.js in-process execution. Returns the raw
 * input unchanged (pass-through). Errors are swallowed to keep the hook
 * non-blocking, mirroring the original main().catch() behavior.
 */
function run(rawInput, _opts) {
  try {
    return suggestCompact(rawInput);
  } catch (err) {
    console.error('[StrategicCompact] Error:', err.message);
    return typeof rawInput === 'string' ? rawInput : '';
  }
}

module.exports = { run, suggestCompact };

// Direct-invocation behavior, unchanged: increment counter, exit 0.
if (require.main === module) {
  const MAX_STDIN = 1024 * 1024;
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => {
    if (data.length < MAX_STDIN) {
      data += c.substring(0, MAX_STDIN - data.length);
    }
  });
  process.stdin.on('end', () => {
    run(data);
    process.exit(0);
  });
  process.stdin.on('error', () => {
    run('');
    process.exit(0);
  });
}
