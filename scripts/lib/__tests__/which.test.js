'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { whichCli } = require('../which');

test('resolves a tool that is on PATH (node)', () => {
  // node is guaranteed present (we are running under it).
  const found = whichCli('node');
  assert.ok(found, 'expected to resolve node');
  assert.ok(/node(\.exe)?$/i.test(found), `unexpected path: ${found}`);
});

test('env override wins and is returned as an absolute path', () => {
  const key = 'ECC_WHICH_TEST_BIN';
  process.env[key] = process.execPath; // a real, existing file
  try {
    const found = whichCli('totally-bogus-name-xyz', { envVars: [key] });
    assert.equal(found, path.resolve(process.execPath));
  } finally {
    delete process.env[key];
  }
});

test('ignores an env override that points at a missing file', () => {
  const key = 'ECC_WHICH_TEST_MISSING';
  process.env[key] = path.join(path.dirname(process.execPath), '__no_such_file__.exe');
  try {
    const found = whichCli('node', { envVars: [key] });
    // falls through to PATH resolution, still finds the real node
    assert.ok(found && /node(\.exe)?$/i.test(found));
  } finally {
    delete process.env[key];
  }
});

test('returns null for a command that does not exist anywhere', () => {
  assert.equal(whichCli('definitely-not-a-real-cli-7f3a2b'), null);
});
