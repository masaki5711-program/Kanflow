#!/usr/bin/env node
'use strict';

/**
 * ECC Skill Health CLI.
 *
 * Renders the skill portfolio health dashboard — success-rate sparklines,
 * failure-pattern clustering, pending amendments, and version history.
 *
 * Usage:
 *   node scripts/skills-health.js --dashboard
 *   node scripts/skills-health.js --dashboard --panel failures
 *   node scripts/skills-health.js --dashboard --json
 *
 * Backed by scripts/lib/skill-evolution/dashboard.js. Reads skill execution
 * records discovered by the skill-evolution tracker; with no recorded data it
 * still renders an empty dashboard rather than failing.
 */

const dashboard = require('./lib/skill-evolution/dashboard');

function parseArgs(argv) {
  const args = { json: false, panel: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--panel') {
      args.panel = argv[i + 1] || null;
      i += 1;
    } else if (arg.startsWith('--panel=')) {
      args.panel = arg.slice('--panel='.length);
    }
    // `--dashboard` is the only mode and is accepted but needs no handling.
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  let result;
  try {
    result = dashboard.renderDashboard(args.panel ? { panel: args.panel } : {});
  } catch (error) {
    // renderDashboard() already names the valid panels in its error text.
    process.stderr.write(`[skill-health] ${error.message}\n`);
    process.exit(1);
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
  } else {
    process.stdout.write(result.text);
  }
}

main();
