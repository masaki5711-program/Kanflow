#!/usr/bin/env node
'use strict';

const { isHookEnabled } = require('../lib/hook-flags');

/*
 * @ecc-wiring: standalone — POSIX fallback helper for run-with-flags-shell.sh;
 * deliberately not wired in settings.json (validate-harness-wiring.js reads
 * this marker; rationale recorded in changelog v1.14.0).
 */

/**
 * Pure predicate: returns the yes/no string this CLI prints for a given hookId.
 *
 * Extracted so the decision can be unit-tested in-process without spawning a
 * child or driving stdin. Behavior is identical to the CLI: when no hookId is
 * supplied the hook is treated as enabled ("yes"); otherwise the shared
 * isHookEnabled() predicate decides.
 *
 * @param {string} hookId
 * @param {string} [profilesCsv]
 * @returns {'yes'|'no'}
 */
function checkHookEnabled(hookId, profilesCsv) {
  if (!hookId) return 'yes';
  return isHookEnabled(hookId, { profiles: profilesCsv }) ? 'yes' : 'no';
}

module.exports = { checkHookEnabled };

if (require.main === module) {
  const [, , hookId, profilesCsv] = process.argv;
  process.stdout.write(checkHookEnabled(hookId, profilesCsv));
  process.exit(0);
}
