'use strict';

/**
 * validate-git-policy.js — pure-function tests for the CI policy gate
 * (branch naming §2, Conventional Commits §3, secret scan §6 of
 * iotpf-git-workflow.md). Git plumbing is exercised only in CI.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  checkBranchName,
  checkCommitSubject,
  scanDiffForSecrets,
} = require('../validate-git-policy');

// --- branch naming -----------------------------------------------------------

test('branch: accepts trunk and release branches', () => {
  assert.strictEqual(checkBranchName('main'), null);
  assert.strictEqual(checkBranchName('release/2026.07'), null);
});

test('branch: accepts <type>/L<layer>-PBI-<number>-<topic> forms', () => {
  for (const name of [
    'feat/L3-PBI-34-spc-window',
    'fix/L1-PBI-7-gateway-reconnect',
    'refactor/L4-PBI-120-dashboard-grid',
    'feat/Lai-PBI-1024-anomaly-router',
    'hotfix/L2-PBI-34-store-forward-overflow',
    'fix/Linfra-PBI-5-risk-remediation',
    'chore/Lcross-PBI-12-rule-sync',
  ]) {
    assert.strictEqual(checkBranchName(name), null, `expected valid: ${name}`);
  }
});

test('branch: accepts NOPBI as the explicit declaration that the work has no PBI', () => {
  for (const name of ['chore/Lcross-NOPBI-rule-sync', 'fix/Linfra-NOPBI-env-template-scan']) {
    assert.strictEqual(checkBranchName(name), null, `expected valid: ${name}`);
  }
  for (const name of [
    'chore/Lcross-NOPBI',          // no topic
    'chore/Lcross-NOPBI-',         // empty topic
    'chore/Lcross-nopbi-rule',     // lower-case reads as a topic: the PBI segment is missing
    'chore/NOPBI-rule-sync',       // no layer
  ]) {
    assert.ok(checkBranchName(name), `expected invalid: ${JSON.stringify(name)}`);
  }
  assert.match(checkBranchName('chore/Lcross-rule-sync'), /NOPBI/, 'the error names the no-PBI form');
});

test('branch: rejects off-convention names', () => {
  for (const name of [
    'feature/L3-PBI-34-spc',      // bad type
    'feat/L5-PBI-34-nope',        // bad layer
    'feat/l3-PBI-34-lowercase-l', // lowercase L
    'feat/L3_PBI-34-underscores', // missing separator after the layer
    'my-branch',                  // no structure
    'feat/L3-PBI-34-',            // empty topic
    'feat/L3-PBI-34',             // no topic
    'feat/L3-PBI-034-spc',        // leading zero
    'feat/L3-PBI-0-spc',          // not a PBI number
    'feat/L3-PBI-spc-window',     // no number
    'feat/L3-PBI34-spc-window',   // no separator before the number
    'feat/L3-spc-PBI-34-window',  // PBI not directly after the layer
    'feat/PBI-34-spc-window',     // no layer
    '',
  ]) {
    assert.ok(checkBranchName(name), `expected invalid: ${JSON.stringify(name)}`);
  }
});

test('branch: a name without the PBI number is rejected with a message that says so', () => {
  for (const name of ['feat/L3-spc-window', 'chore/Lcross-rule-sync', 'feat/L3-pbi-34-spc-window']) {
    assert.match(checkBranchName(name), /PBI number is missing/, name);
  }
  assert.doesNotMatch(checkBranchName('my-branch'), /PBI number is missing/);
});

// --- commit subjects ----------------------------------------------------------

test('commits: accepts Conventional Commits subjects', () => {
  for (const s of [
    'feat: add SPC window',
    'fix(gateway): reconnect after LAN blip',
    'refactor!: split hub crate',
    'ci: promote ecc-coverage to a blocking gate (82.39%/81.67% measured in CI)',
    'docs: changelog v1.13.0',
  ]) {
    assert.strictEqual(checkCommitSubject(s), null, `expected valid: ${s}`);
  }
});

test('commits: skips merge/revert/fixup subjects', () => {
  assert.strictEqual(checkCommitSubject("Merge branch 'main' into feat/L3-x"), null);
  assert.strictEqual(checkCommitSubject('Revert "feat: add SPC window"'), null);
  assert.strictEqual(checkCommitSubject('fixup! fix: typo'), null);
});

test('commits: rejects non-conventional subjects', () => {
  for (const s of ['update stuff', 'WIP', 'Feat: capitalized type', 'feat:missing space', '']) {
    assert.ok(checkCommitSubject(s), `expected invalid: ${JSON.stringify(s)}`);
  }
});

// --- secret scan ---------------------------------------------------------------

function diff(file, addedLines) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -0,0 +1 @@',
    ...addedLines.map(l => `+${l}`),
  ].join('\n');
}

test('secrets: flags an AWS access key on an added line', () => {
  const findings = scanDiffForSecrets(diff('src/config.ts', ['const key = "AKIAIOSFODNN7EXAMPLE";']));
  assert.strictEqual(findings.length, 1);
  assert.match(findings[0], /aws-access-key/);
  assert.match(findings[0], /redacted/, 'excerpt must be redacted');
});

test('secrets: flags a private key block and a long credential literal', () => {
  const findings = scanDiffForSecrets(diff('deploy/vpn.conf', [
    '-----BEGIN RSA PRIVATE KEY-----',
    'password = "aVeryLongCredentialValue123456"',
  ]));
  assert.strictEqual(findings.length, 2);
});

test('secrets: ignores removed lines and context lines', () => {
  const text = [
    'diff --git a/src/x.ts b/src/x.ts',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -1 +1 @@',
    '-const key = "AKIAIOSFODNN7EXAMPLE";',
    ' const other = "AKIAIOSFODNN7EXAMPLE";',
  ].join('\n');
  assert.strictEqual(scanDiffForSecrets(text).length, 0);
});

test('secrets: test fixtures and eval specs are excluded', () => {
  const findings = scanDiffForSecrets([
    diff('scripts/hooks/__tests__/fixture.js', ['const k = "AKIAIOSFODNN7EXAMPLE";']),
    diff('evals/specs/security-reviewer.hardcoded-secret.json', ['"code": "AKIAIOSFODNN7EXAMPLE"']),
    diff('src/lib/api.test.ts', ['const k = "AKIAIOSFODNN7EXAMPLE";']),
  ].join('\n'));
  assert.strictEqual(findings.length, 0);
});

test('secrets: ecc-allow-secret waiver marker suppresses a finding', () => {
  const findings = scanDiffForSecrets(
    diff('docs/example.md', ['AKIAIOSFODNN7EXAMPLE — synthetic sample // ecc-allow-secret']),
  );
  assert.strictEqual(findings.length, 0);
});

test('secrets: clean diff yields no findings', () => {
  const findings = scanDiffForSecrets(diff('src/ok.ts', ['const apiKey = process.env.API_KEY;']));
  assert.strictEqual(findings.length, 0);
});
