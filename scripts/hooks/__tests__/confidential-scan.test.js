#!/usr/bin/env node
/**
 * Tests for scripts/lib/confidential-patterns.js and
 * scripts/hooks/pre-bash-confidential-scan.js.
 *
 * Pure-library tests (scanText / scanFilename / scanDiff) cover positive
 * and negative cases for each pattern category. Hook-level tests cover
 * extractCommitMessages parsing. The full hook (with git diff spawn) is
 * not unit-tested here — that path is exercised by integration in CI.
 */

'use strict';

const assert = require('assert');
const lib = require('../../lib/confidential-patterns');
const hook = require('../pre-bash-confidential-scan');

function assertSomeFinding(findings, patternNameSubstring) {
  const hit = findings.some(f => f.pattern.toLowerCase().includes(patternNameSubstring.toLowerCase()));
  assert.ok(
    hit,
    `expected a finding matching "${patternNameSubstring}", got: ${JSON.stringify(findings.map(f => f.pattern))}`,
  );
}

function assertNoFindings(findings) {
  assert.deepStrictEqual(findings, [], `expected no findings, got: ${JSON.stringify(findings)}`);
}

const tests = [
  // ── scanText: credentials ───────────────────────────────────────────────
  {
    name: 'scanText detects GitLab PAT',
    fn: () => {
      const r = lib.scanText('const tok = "glpat-abcdefghijklmnopqrst"');
      assertSomeFinding(r, 'GitLab');
      assert.strictEqual(r[0].severity, 'critical');
    },
  },
  {
    name: 'scanText detects AWS access key',
    fn: () => {
      const r = lib.scanText('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE');
      assertSomeFinding(r, 'AWS');
    },
  },
  {
    name: 'scanText detects generic credential assignment',
    fn: () => {
      const r = lib.scanText('password = "supersecret_passphrase_1234567890"');
      assertSomeFinding(r, 'Generic credential');
    },
  },
  {
    name: 'scanText detects PEM private key block',
    fn: () => {
      const r = lib.scanText('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA');
      assertSomeFinding(r, 'PEM');
    },
  },

  // ── scanText: manufacturing-confidential ────────────────────────────────
  {
    name: 'scanText detects plant code literal',
    fn: () => {
      const r = lib.scanText('plant_code: "PLANT-DEMO-01"');
      assertSomeFinding(r, 'Plant code');
    },
  },
  {
    name: 'scanText detects serial number literal',
    fn: () => {
      const r = lib.scanText('serial_no = "SN20251234567"');
      assertSomeFinding(r, 'Serial');
    },
  },
  {
    name: 'scanText detects MAC address',
    fn: () => {
      const r = lib.scanText('macAddress: "AC:DE:48:00:11:22"');
      assertSomeFinding(r, 'MAC');
    },
  },
  {
    name: 'scanText detects internal IP (10.x not 10.0.0.1)',
    fn: () => {
      const r = lib.scanText('edge_ip = "10.50.123.45"');
      assertSomeFinding(r, 'Internal IPv4 (10');
    },
  },
  {
    name: 'scanText does NOT flag 10.0.0.1 loopback-like',
    fn: () => {
      const r = lib.scanText('loopback = "10.0.0.1"');
      const internal = r.filter(f => f.pattern.includes('10.x'));
      assertNoFindings(internal);
    },
  },
  {
    name: 'scanText detects internal IP (172.16-31.x.x)',
    fn: () => {
      const r = lib.scanText('gateway_ip = "172.20.5.10"');
      assertSomeFinding(r, '172');
    },
  },
  {
    name: 'scanText does NOT flag 172.15.x.x (out of internal range)',
    fn: () => {
      const r = lib.scanText('public_ip = "172.15.5.10"');
      const internal = r.filter(f => f.pattern.includes('172'));
      assertNoFindings(internal);
    },
  },

  // ── scanText: local paths (warning) ─────────────────────────────────────
  {
    name: 'scanText flags Windows user profile path as warning',
    fn: () => {
      const r = lib.scanText('path = "C:\\Users\\jdoe\\config"');
      const hit = r.find(f => f.pattern.includes('Windows'));
      assert.ok(hit, 'expected Windows user profile path finding');
      assert.strictEqual(hit.severity, 'warning');
    },
  },
  {
    name: 'scanText does NOT flag C:\\Users\\Public',
    fn: () => {
      const r = lib.scanText('shared = "C:\\Users\\Public\\docs"');
      const hit = r.find(f => f.pattern.includes('Windows'));
      assert.strictEqual(hit, undefined);
    },
  },

  // ── scanText: clean content ─────────────────────────────────────────────
  {
    name: 'scanText returns empty for clean code',
    fn: () => {
      const r = lib.scanText('function add(a, b) { return a + b; }');
      assertNoFindings(r);
    },
  },
  {
    name: 'scanText returns empty for documentation placeholder values',
    fn: () => {
      const r = lib.scanText('plant_code = "<PLANT_CODE_HERE>"');
      // The placeholder is in <>, value len < 13 — should not match strict regex.
      const critical = r.filter(f => f.severity === 'critical');
      assertNoFindings(critical);
    },
  },

  // ── scanFilename ────────────────────────────────────────────────────────
  {
    name: 'scanFilename flags .pcap as critical',
    fn: () => {
      const r = lib.scanFilename('captures/line3.pcap');
      assertSomeFinding(r, 'PCAP');
      assert.strictEqual(r[0].severity, 'critical');
    },
  },
  {
    name: 'scanFilename flags .csv as warning',
    fn: () => {
      const r = lib.scanFilename('data/lot.csv');
      const hit = r.find(f => f.pattern.includes('CSV'));
      assert.ok(hit);
      assert.strictEqual(hit.severity, 'warning');
    },
  },
  {
    name: 'scanFilename flags .env files as critical',
    fn: () => {
      const r = lib.scanFilename('apps/edge/.env.production');
      assertSomeFinding(r, 'Environment');
      assert.strictEqual(r[0].severity, 'critical');
    },
  },
  {
    name: 'scanFilename does NOT flag env TEMPLATES by name (.env.example / .sample / .template / .dist)',
    fn: () => {
      for (const p of ['.env.example', 'apps/hub/.env.sample', 'apps/web/.env.template', '.env.dist', 'apps/edge/.env.production.example']) {
        assertNoFindings(lib.scanFilename(p));
      }
    },
  },
  {
    name: 'scanFilename still flags real env files, including look-alikes of a template name',
    fn: () => {
      for (const p of ['.env', 'apps/edge/.env.local', '.env.example.local', '.env.examples', '.env.production']) {
        assertSomeFinding(lib.scanFilename(p), 'Environment');
      }
    },
  },
  {
    name: 'scanDiff still blocks a credential written into an env template',
    fn: () => {
      const diff = [
        'diff --git a/.env.example b/.env.example',
        '--- a/.env.example',
        '+++ b/.env.example',
        '@@ -1,0 +2,1 @@',
        '+GITLAB_TOKEN=glpat-' + 'a'.repeat(20),
      ].join('\n');
      assert.ok(lib.hasCritical(lib.scanDiff(diff)), 'a real-looking token in a template must stay critical');
    },
  },
  {
    name: 'scanFilename does NOT flag .ts or .md',
    fn: () => {
      assertNoFindings(lib.scanFilename('apps/web/src/Button.tsx'));
      assertNoFindings(lib.scanFilename('docs/architecture.md'));
    },
  },

  // ── scanDiff ────────────────────────────────────────────────────────────
  {
    name: 'scanDiff finds critical in added lines only',
    fn: () => {
      const diff = [
        'diff --git a/cfg.ts b/cfg.ts',
        '--- a/cfg.ts',
        '+++ b/cfg.ts',
        '@@ -1,1 +1,2 @@',
        '-const a = 1;',
        '+const token = "glpat-aaaaaaaaaaaaaaaaaaaa";',
        '+const ok = "harmless";',
      ].join('\n');
      const r = lib.scanDiff(diff);
      assertSomeFinding(r, 'GitLab');
      // Filename is captured.
      assert.strictEqual(r[0].source, 'cfg.ts');
    },
  },
  {
    name: 'scanDiff ignores removed lines',
    fn: () => {
      const diff = [
        'diff --git a/cfg.ts b/cfg.ts',
        '+++ b/cfg.ts',
        '@@ -1 +1 @@',
        '-const token = "glpat-aaaaaaaaaaaaaaaaaaaa";',
        '+const removed = "harmless";',
      ].join('\n');
      const r = lib.scanDiff(diff);
      assertNoFindings(r);
    },
  },
  {
    name: 'scanDiff deduplicates identical findings across repeated lines',
    fn: () => {
      const diff = [
        'diff --git a/a.ts b/a.ts',
        '+++ b/a.ts',
        '@@ +1,2 @@',
        '+token = "glpat-aaaaaaaaaaaaaaaaaaaa"',
        '+token = "glpat-aaaaaaaaaaaaaaaaaaaa"',
      ].join('\n');
      const r = lib.scanDiff(diff);
      // Two patterns match each line (GitLab PAT + Generic credential),
      // but each (pattern, source, match) tuple deduplicates to 1.
      assert.strictEqual(r.length, 2, `expected 2 unique findings, got ${r.length}`);
      const patterns = r.map(f => f.pattern).sort();
      assert.deepStrictEqual(patterns, [
        'Generic credential assignment',
        'GitLab Personal Access Token',
      ]);
    },
  },
  {
    name: 'scanDiff finds .pcap filename critical even without content',
    fn: () => {
      const diff = [
        'diff --git a/captures/line3.pcap b/captures/line3.pcap',
        '+++ b/captures/line3.pcap',
        'Binary files differ',
      ].join('\n');
      const r = lib.scanDiff(diff);
      assertSomeFinding(r, 'PCAP');
    },
  },

  // ── isTestPath / TEST_PATH_ALLOWLIST ────────────────────────────────────
  {
    name: 'isTestPath true for __tests__ dirs',
    fn: () => {
      assert.strictEqual(lib.isTestPath('scripts/hooks/__tests__/foo.test.js'), true);
    },
  },
  {
    name: 'isTestPath true for *.test.* files',
    fn: () => {
      assert.strictEqual(lib.isTestPath('apps/web/Button.test.tsx'), true);
    },
  },
  {
    name: 'isTestPath true for fixtures/',
    fn: () => {
      assert.strictEqual(lib.isTestPath('scripts/hooks/__tests__/fixtures/sample.json'), true);
    },
  },
  {
    name: 'isTestPath false for normal source files',
    fn: () => {
      assert.strictEqual(lib.isTestPath('apps/web/src/Button.tsx'), false);
      assert.strictEqual(lib.isTestPath('scripts/lib/confidential-patterns.js'), false);
    },
  },
  {
    name: 'scanDiff skips content scanning in test paths',
    fn: () => {
      const diff = [
        'diff --git a/scripts/hooks/__tests__/foo.test.js b/scripts/hooks/__tests__/foo.test.js',
        '+++ b/scripts/hooks/__tests__/foo.test.js',
        '@@ +1 @@',
        '+const tok = "glpat-aaaaaaaaaaaaaaaaaaaa"; // synthetic test fixture',
      ].join('\n');
      const r = lib.scanDiff(diff);
      assertNoFindings(r);
    },
  },
  {
    name: 'scanDiff still scans content in non-test paths',
    fn: () => {
      const diff = [
        'diff --git a/scripts/lib/leak.js b/scripts/lib/leak.js',
        '+++ b/scripts/lib/leak.js',
        '@@ +1 @@',
        '+const tok = "glpat-aaaaaaaaaaaaaaaaaaaa";',
      ].join('\n');
      const r = lib.scanDiff(diff);
      assertSomeFinding(r, 'GitLab');
    },
  },

  // ── hasCritical ─────────────────────────────────────────────────────────
  {
    name: 'hasCritical true when any critical present',
    fn: () => {
      assert.strictEqual(
        lib.hasCritical([{ severity: 'warning' }, { severity: 'critical' }]),
        true,
      );
    },
  },
  {
    name: 'hasCritical false when all warnings',
    fn: () => {
      assert.strictEqual(
        lib.hasCritical([{ severity: 'warning' }, { severity: 'warning' }]),
        false,
      );
    },
  },

  // ── hook.extractCommitMessages ──────────────────────────────────────────
  {
    name: 'extractCommitMessages parses -m "msg"',
    fn: () => {
      const m = hook.extractCommitMessages('git commit -m "feat: add thing"');
      assert.deepStrictEqual(m, ['feat: add thing']);
    },
  },
  {
    name: 'extractCommitMessages parses --message=msg',
    fn: () => {
      const m = hook.extractCommitMessages('git commit --message=hello');
      assert.deepStrictEqual(m, ['hello']);
    },
  },
  {
    name: 'extractCommitMessages parses multiple -m flags',
    fn: () => {
      const m = hook.extractCommitMessages('git commit -m "first" -m "second"');
      assert.deepStrictEqual(m, ['first', 'second']);
    },
  },
  {
    name: 'extractCommitMessages returns empty for commit without -m',
    fn: () => {
      const m = hook.extractCommitMessages('git commit');
      assert.deepStrictEqual(m, []);
    },
  },

  // ── hook.evaluate end-to-end ────────────────────────────────────────────
  {
    name: 'hook.evaluate passes through non-git-commit command',
    fn: () => {
      const r = hook.evaluate(JSON.stringify({ tool_input: { command: 'ls -la' } }));
      assert.strictEqual(r.exitCode, 0);
    },
  },
  {
    name: 'hook.evaluate passes through git commit --help',
    fn: () => {
      const r = hook.evaluate(JSON.stringify({ tool_input: { command: 'git commit --help' } }));
      assert.strictEqual(r.exitCode, 0);
    },
  },
  {
    name: 'hook.evaluate blocks when -m message contains credential',
    fn: () => {
      const r = hook.evaluate(
        JSON.stringify({
          tool_input: {
            command: 'git commit -m "use token glpat-aaaaaaaaaaaaaaaaaaaa"',
          },
        }),
      );
      assert.strictEqual(r.exitCode, 2);
      assert.match(r.stderr || '', /GitLab/);
    },
  },

  // ── synthetic-declaration exemption (CLAUDE.md §6) ──────────────────────
  {
    name: 'declaresSynthetic recognises the project markers',
    fn: () => {
      assert.ok(lib.declaresSynthetic('all values here are synthetic'));
      assert.ok(lib.declaresSynthetic('事例の値はすべて合成データである'));
      assert.ok(!lib.declaresSynthetic('ordinary specification prose'));
      assert.ok(!lib.declaresSynthetic(null));
    },
  },
  {
    name: 'scanDiff without a fileText resolver still blocks plant/serial literals',
    fn: () => {
      const diff = [
        'diff --git a/spec.md b/spec.md',
        '+++ b/spec.md',
        '@@ +1,2 @@',
        "+  plant_code      = 'P900'",
        "+  serial_no       = 'SN26081700002'",
      ].join('\n');
      const r = lib.scanDiff(diff);
      assert.strictEqual(r.filter(f => f.severity === 'critical').length, 2);
      assert.ok(lib.hasCritical(r));
    },
  },
  {
    name: 'scanDiff exempts plant/serial literals when the file declares synthetic data',
    fn: () => {
      const diff = [
        'diff --git a/spec.md b/spec.md',
        '+++ b/spec.md',
        '@@ +1,2 @@',
        "+  plant_code      = 'P900'",
        "+  serial_no       = 'SN26081700002'",
      ].join('\n');
      const r = lib.scanDiff(diff, {
        fileText: () => '事例の値はすべて合成データ（kit seed）で、実在の設備ではない。',
      });
      assert.strictEqual(r.filter(f => f.severity === 'critical').length, 0);
      assert.strictEqual(r.filter(f => f.exempt).length, 2);
      assert.ok(!lib.hasCritical(r));
    },
  },
  {
    name: 'a synthetic declaration never exempts credentials or infrastructure identifiers',
    fn: () => {
      const diff = [
        'diff --git a/spec.md b/spec.md',
        '+++ b/spec.md',
        '@@ +1,3 @@',
        '+const token = "glpat-aaaaaaaaaaaaaaaaaaaa";',
        '+mac = "00:1B:44:11:3A:B7"',
        "+  plant_code      = 'P900'",
      ].join('\n');
      const r = lib.scanDiff(diff, { fileText: () => 'synthetic sample data' });
      assert.ok(lib.hasCritical(r));
      const exemptNames = r.filter(f => f.exempt).map(f => f.pattern);
      assert.deepStrictEqual(exemptNames, ['Plant code literal']);
    },
  },
  {
    name: 'a throwing fileText resolver keeps the scan strict',
    fn: () => {
      const diff = [
        'diff --git a/spec.md b/spec.md',
        '+++ b/spec.md',
        '@@ +1,1 @@',
        "+  plant_code      = 'P900'",
      ].join('\n');
      const r = lib.scanDiff(diff, {
        fileText: () => { throw new Error('git show failed'); },
      });
      assert.ok(lib.hasCritical(r));
    },
  },
];

module.exports = { tests };

if (require.main === module) {
  let failed = 0;
  for (const t of tests) {
    try {
      t.fn();
      process.stdout.write('✓ ' + t.name + '\n');
    } catch (err) {
      failed += 1;
      process.stdout.write('✗ ' + t.name + '\n');
      process.stdout.write('  ' + (err.stack || err.message) + '\n');
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}
