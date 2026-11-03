#!/usr/bin/env node
/**
 * Backward-compatible doc warning hook entrypoint.
 * Kept for consumers that still reference pre-write-doc-warn.js directly.
 *
 * @ecc-wiring: standalone — legacy shim; the wired hook is doc-file-warning.js
 * (validate-harness-wiring.js reads this marker).
 */

'use strict';

// Delegate to the canonical implementation. Requiring it preserves the original
// direct-invocation behavior (its module-scope stdin listeners run when this
// file is the entrypoint), and re-exporting run() makes this entrypoint
// in-process executable via run-with-flags.js (no behavior change).
const docFileWarning = require('./doc-file-warning.js');

module.exports = { run: docFileWarning.run };
