'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CURRENT_PLUGIN_SLUG = 'ecc';
const LEGACY_PLUGIN_SLUG = 'everything-claude-code';
const CURRENT_PLUGIN_HANDLE = `${CURRENT_PLUGIN_SLUG}@${CURRENT_PLUGIN_SLUG}`;
const LEGACY_PLUGIN_HANDLE = `${LEGACY_PLUGIN_SLUG}@${LEGACY_PLUGIN_SLUG}`;
const PLUGIN_CACHE_SLUGS = [CURRENT_PLUGIN_SLUG, LEGACY_PLUGIN_SLUG];
const PLUGIN_ROOT_SEGMENTS = [
  [CURRENT_PLUGIN_SLUG],
  [CURRENT_PLUGIN_HANDLE],
  ['marketplace', CURRENT_PLUGIN_SLUG],
  [LEGACY_PLUGIN_SLUG],
  [LEGACY_PLUGIN_HANDLE],
  ['marketplace', LEGACY_PLUGIN_SLUG],
];

/**
 * Resolve the ECC source root directory.
 *
 * Tries, in order:
 *   1. CLAUDE_PLUGIN_ROOT env var (set by Claude Code for hooks, or by user)
 *   2. Project-local install — CLAUDE_PROJECT_DIR or cwd, when ECC's scripts/
 *      were copied beside .claude/ in a project root (the README install model)
 *   3. Standard install location (~/.claude/) — when scripts exist there
 *   4. Known plugin roots under ~/.claude/plugins/ (current + legacy slugs)
 *   5. Plugin cache auto-detection — scans ~/.claude/plugins/cache/{ecc,everything-claude-code}/
 *   6. Fallback to ~/.claude/ (original behaviour)
 *
 * @param {object} [options]
 * @param {string} [options.homeDir]     Override home directory (for testing)
 * @param {string} [options.envRoot]     Override CLAUDE_PLUGIN_ROOT (for testing)
 * @param {string} [options.projectDir]  Override CLAUDE_PROJECT_DIR (for testing)
 * @param {string} [options.cwd]         Override process.cwd() (for testing)
 * @param {string} [options.probe]       Relative path used to verify a candidate root
 *                                       contains ECC scripts. Default: 'scripts/lib/utils.js'
 * @returns {string} Resolved ECC root path
 */
function resolveEccRoot(options = {}) {
  const envRoot = options.envRoot !== undefined
    ? options.envRoot
    : (process.env.CLAUDE_PLUGIN_ROOT || '');

  if (envRoot && envRoot.trim()) {
    return envRoot.trim();
  }

  const homeDir = options.homeDir || os.homedir();
  const claudeDir = path.join(homeDir, '.claude');
  const probe = options.probe || path.join('scripts', 'lib', 'utils.js');

  // Project-local install — ECC copied into a project root, with scripts/
  // beside .claude/. Checked before ~/.claude so a project-root copy wins
  // over a stale or unrelated home install.
  const projectCandidates = [
    options.projectDir !== undefined ? options.projectDir : process.env.CLAUDE_PROJECT_DIR,
    options.cwd !== undefined ? options.cwd : process.cwd(),
  ];
  for (const candidate of projectCandidates) {
    if (candidate && String(candidate).trim() && fs.existsSync(path.join(candidate, probe))) {
      return candidate;
    }
  }

  // Standard install — files are copied directly into ~/.claude/
  if (fs.existsSync(path.join(claudeDir, probe))) {
    return claudeDir;
  }

  // Exact legacy plugin install locations. These preserve backwards
  // compatibility without scanning arbitrary plugin trees.
  const legacyPluginRoots = PLUGIN_ROOT_SEGMENTS.map((segments) =>
    path.join(claudeDir, 'plugins', ...segments)
  );

  for (const candidate of legacyPluginRoots) {
    if (fs.existsSync(path.join(candidate, probe))) {
      return candidate;
    }
  }

  // Plugin cache — Claude Code stores marketplace plugins under
  // ~/.claude/plugins/cache/<plugin-name>/<org>/<version>/
  try {
    for (const slug of PLUGIN_CACHE_SLUGS) {
      const cacheBase = path.join(claudeDir, 'plugins', 'cache', slug);
      const orgDirs = fs.readdirSync(cacheBase, { withFileTypes: true });

      for (const orgEntry of orgDirs) {
        if (!orgEntry.isDirectory()) continue;
        const orgPath = path.join(cacheBase, orgEntry.name);

        let versionDirs;
        try {
          versionDirs = fs.readdirSync(orgPath, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const verEntry of versionDirs) {
          if (!verEntry.isDirectory()) continue;
          const candidate = path.join(orgPath, verEntry.name);
          if (fs.existsSync(path.join(candidate, probe))) {
            return candidate;
          }
        }
      }
    }
  } catch {
    // Plugin cache doesn't exist or isn't readable — continue to fallback
  }

  return claudeDir;
}

/**
 * Compact inline version for embedding in command .md code blocks.
 *
 * This is the minified form of resolveEccRoot() suitable for use in
 * node -e "..." scripts where require() is not available before the
 * root is known.
 *
 * Usage in commands:
 *   const _r = <paste INLINE_RESOLVE>;
 *   const sm = require(_r + '/scripts/lib/session-manager');
 */
const INLINE_RESOLVE = `(()=>{var p=require('path'),f=require('fs'),q=p.join('scripts','lib','utils.js');var e=process.env.CLAUDE_PLUGIN_ROOT;if(e&&e.trim())return e.trim();for(var j of [process.env.CLAUDE_PROJECT_DIR,process.cwd()]){if(j&&j.trim()&&f.existsSync(p.join(j,q)))return j}var h=require('os').homedir(),d=p.join(h,'.claude');if(f.existsSync(p.join(d,q)))return d;for(var s of ${JSON.stringify(PLUGIN_ROOT_SEGMENTS)}){var l=p.join(d,'plugins',...s);if(f.existsSync(p.join(l,q)))return l}try{for(var g of ${JSON.stringify(PLUGIN_CACHE_SLUGS)}){var b=p.join(d,'plugins','cache',g);for(var o of f.readdirSync(b,{withFileTypes:true})){if(!o.isDirectory())continue;for(var v of f.readdirSync(p.join(b,o.name),{withFileTypes:true})){if(!v.isDirectory())continue;var c=p.join(b,o.name,v.name);if(f.existsSync(p.join(c,q)))return c}}}}catch(x){}return d})()`;

module.exports = {
  resolveEccRoot,
  INLINE_RESOLVE,
};
