'use strict';

/*
 * once-per-session.js — "this gate already fired for <key> in this session".
 *
 * Backing store is a small JSON file in the OS temp dir, keyed by the hook
 * event's session_id (falling back to CLAUDE_SESSION_ID, then a hash of cwd).
 * Entries expire so that a resumed session — same id, hours later — is
 * checked again. Best-effort by design: an unreadable or unwritable store
 * degrades to "not seen", never to an error (CLAUDE.md §7).
 *
 * Node built-ins only.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

function stateFile(namespace, input) {
  const raw =
    (input && input.session_id) ||
    process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  const id = String(raw).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `ecc-${namespace}-${id}.json`);
}

function readSeen(file, ttlMs) {
  try {
    if (Date.now() - fs.statSync(file).mtimeMs > ttlMs) return [];
    const seen = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(seen) ? seen : [];
  } catch {
    return [];
  }
}

/**
 * True the first time `key` is seen for this session (and records it);
 * false on every later call within the TTL.
 * @param {string} namespace - short hook-specific name, part of the file name
 * @param {object} input - parsed hook event (for session_id)
 * @param {string} key
 * @param {number} [ttlMs]
 */
function firstTime(namespace, input, key, ttlMs = DEFAULT_TTL_MS) {
  const file = stateFile(namespace, input);
  const seen = readSeen(file, ttlMs);
  if (seen.includes(key)) return false;
  try {
    fs.writeFileSync(file, JSON.stringify([...seen, key]), 'utf8');
  } catch {
    /* best-effort */
  }
  return true;
}

module.exports = { firstTime, stateFile };
