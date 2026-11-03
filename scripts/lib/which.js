'use strict';

/*
 * which.js — portable CLI resolver (Node built-ins only).
 *
 * Why this exists: `which <cmd>` / `command -v <cmd>` / `Get-Command <cmd>`
 * only look at PATH. On Windows a tool is frequently installed to a per-user
 * dir that the installer never adds to PATH (e.g. glab lands in
 * %LOCALAPPDATA%\Programs\glab\glab.exe). A bare PATH probe then falsely
 * reports "not installed". This resolver also searches the common install
 * locations and honors an explicit env override, so detection is correct on a
 * freshly-cloned repo on any PC.
 *
 * Usage:
 *   const { whichCli } = require('./lib/which');
 *   const glab = whichCli('glab', { envVars: ['GLAB_PATH'] });  // absolute path or null
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function isFile(p) {
  try {
    return !!p && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// On Windows, try the bare name plus each PATHEXT extension.
function candidateNames(name) {
  if (process.platform !== 'win32' || path.extname(name)) return [name];
  const exts = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD;.PS1')
    .split(';')
    .map((e) => e.trim())
    .filter(Boolean);
  return [name, ...exts.map((e) => name + e.toLowerCase())];
}

// Common install dirs that are frequently NOT on PATH, per platform.
function commonDirs(name) {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const lad = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return [
      path.join(lad, 'Programs', name), // per-tool user install (e.g. glab)
      path.join(lad, 'Programs'),
      path.join(lad, 'Microsoft', 'WinGet', 'Links'),
      path.join(home, 'scoop', 'shims'),
      'C:\\ProgramData\\chocolatey\\bin',
      path.join(pf, name, 'bin'),
      path.join(pf86, name, 'bin'),
    ];
  }
  return [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/opt/homebrew/bin',
    '/snap/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, 'bin'),
  ];
}

/**
 * Resolve a CLI executable to an absolute path, or return null.
 * @param {string} name      executable name without extension (e.g. "glab")
 * @param {object} [opts]
 * @param {string[]} [opts.envVars]  env var names to check first (value = full path)
 * @param {string[]} [opts.extraDirs] extra directories to search
 */
function whichCli(name, opts = {}) {
  // 1. explicit override wins — lets any PC point at a non-standard install.
  for (const ev of opts.envVars || []) {
    const v = process.env[ev];
    if (v && isFile(v)) return path.resolve(v);
  }

  const names = candidateNames(name);
  const pathDirs = (process.env.PATH || process.env.Path || '')
    .split(path.delimiter)
    .filter(Boolean);
  const dirs = [...pathDirs, ...commonDirs(name), ...(opts.extraDirs || [])];

  for (const dir of dirs) {
    for (const n of names) {
      const full = path.join(dir, n);
      if (isFile(full)) return full;
    }
  }
  return null;
}

module.exports = { whichCli };
