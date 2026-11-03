#!/usr/bin/env node
'use strict';

/*
 * check-tooling.js — resolve external CLIs this repo's workflows rely on,
 * correctly even when the tool is installed but not on PATH (common on Windows).
 *
 *   node scripts/check-tooling.js              # check the default set
 *   node scripts/check-tooling.js glab         # check one tool, print its path
 *   node scripts/check-tooling.js glab gh git  # check several
 *
 * Prints "<name>: <absolute path>" when found, or a remediation line when not.
 * Exit 0 if every requested tool was found, 1 otherwise. Agents and skills
 * should resolve a CLI through this (or scripts/lib/which.js) before concluding
 * a tool is "not installed".
 */

const { whichCli } = require('./lib/which');

// Per-tool metadata: env override(s) + how to install.
const KNOWN = {
  glab: {
    envVars: ['GLAB_PATH', 'ECC_GLAB'],
    install: 'winget install GLab.GLab | brew install glab | scoop install glab',
  },
  gh: { envVars: ['GH_PATH'], install: 'https://cli.github.com' },
  git: { envVars: ['GIT_PATH'], install: 'https://git-scm.com' },
  node: { envVars: ['NODE_BIN'], install: 'https://nodejs.org' },
};

// Default set = the external CLIs the project's git/MR workflow needs.
const DEFAULT_TOOLS = ['git', 'glab'];

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const tools = requested.length ? requested : DEFAULT_TOOLS;

let allFound = true;
for (const name of tools) {
  const meta = KNOWN[name] || {};
  const found = name === 'node' ? process.execPath : whichCli(name, { envVars: meta.envVars });
  if (found) {
    console.log(`${name}: ${found}`);
  } else {
    allFound = false;
    const override = (meta.envVars || [`${name.toUpperCase()}_PATH`])[0];
    console.log(
      `${name}: NOT FOUND on PATH or common install dirs — ` +
        `install (${meta.install || 'see vendor docs'}) or set ${override}=<absolute path>.`,
    );
  }
}

process.exit(allFound ? 0 : 1);
