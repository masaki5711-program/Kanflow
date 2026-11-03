'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { score, failReason } = require('../eval-score');

test('passes when every mustFlag token is present', () => {
  const spec = { rubric: { mustFlag: ['hardcoded', 'secret'] } };
  const r = score(spec, 'This is a hardcoded SECRET that must move to env.');
  assert.equal(r.pass, true);
  assert.deepEqual(r.miss, []);
});

test('fails and lists the missing mustFlag tokens', () => {
  const spec = { rubric: { mustFlag: ['hardcoded', 'secret', 'apiKey'] } };
  const r = score(spec, 'found a hardcoded secret');
  assert.equal(r.pass, false);
  assert.deepEqual(r.miss, ['apiKey']);
});

test('mustFlag array entry is satisfied by any one spelling (OR)', () => {
  const spec = { rubric: { mustFlag: ['naive', ['with time zone', 'timestamptz']] } };
  assert.equal(score(spec, 'naive column; use timestamp(6) with time zone').pass, true);
  assert.equal(score(spec, 'naive column; use timestamptz').pass, true);
});

test('mustFlag array entry still fails when no spelling is present', () => {
  const spec = { rubric: { mustFlag: ['naive', ['with time zone', 'timestamptz']] } };
  const r = score(spec, 'naive column; store it as text');
  assert.equal(r.pass, false);
  assert.deepEqual(r.miss, [['with time zone', 'timestamptz']]);
});

test('mustNotFlag catches a false-positive token', () => {
  const spec = { rubric: { mustFlag: ['unwrap'], mustNotFlag: ['sql injection'] } };
  const r = score(spec, 'the unwrap panics; also a SQL injection risk');
  assert.equal(r.pass, false);
  assert.deepEqual(r.falsePos, ['sql injection']);
});

test('minSeverity requires a severity at or above the threshold', () => {
  const spec = { rubric: { mustFlag: ['x'], minSeverity: 'HIGH' } };
  assert.equal(score(spec, 'x is a MEDIUM issue').severityOk, false);
  assert.equal(score(spec, 'x is a HIGH issue').severityOk, true);
  assert.equal(score(spec, 'x is CRITICAL').severityOk, true);
});

test('expectedVerdict must appear in the output', () => {
  const spec = { rubric: { mustFlag: [], expectedVerdict: 'BLOCK' } };
  assert.equal(score(spec, 'overall: BLOCK').verdictOk, true);
  assert.equal(score(spec, 'overall: pass').verdictOk, false);
});

test('verdict token is whole-word: "blocking" does not satisfy BLOCK', () => {
  // Regression: mustFlag ["blocking"] previously spoofed expectedVerdict "BLOCK"
  // via substring (.includes), letting a PASS verdict score as pass.
  const spec = { rubric: { mustFlag: ['blocking'], expectedVerdict: 'BLOCK' } };
  const bad = score(spec, 'a blocking call on the runtime. Overall verdict: PASS');
  assert.equal(bad.verdictOk, false);
  assert.equal(bad.pass, false);
  const good = score(spec, 'a blocking call on the runtime. Overall verdict: BLOCK');
  assert.equal(good.pass, true);
});

test('severity token is whole-word: "high-frequency" does not satisfy HIGH', () => {
  const spec = { rubric: { mustFlag: [], minSeverity: 'HIGH' } };
  assert.equal(score(spec, 'this is high-frequency ingestion, no label given').severityOk, false);
  assert.equal(score(spec, 'severity: HIGH').severityOk, true);
  assert.equal(score(spec, 'rated (CRITICAL)').severityOk, true);
});

test('verdict "PASS" is not spoofed by "passthrough"/"bypass"', () => {
  const spec = { rubric: { mustFlag: [], expectedVerdict: 'PASS' } };
  assert.equal(score(spec, 'uses a passthrough and a bypass').verdictOk, false);
  assert.equal(score(spec, 'final verdict: PASS').verdictOk, true);
});

test('empty rubric passes anything (back-compat)', () => {
  assert.equal(score({ rubric: {} }, 'whatever').pass, true);
  assert.equal(score({}, '').pass, true);
});

test('failReason summarizes every failed dimension', () => {
  const spec = { rubric: { mustFlag: ['unwrap'], mustNotFlag: ['noise'], minSeverity: 'HIGH', expectedVerdict: 'BLOCK' } };
  const reason = failReason(score(spec, 'contains noise, MEDIUM'));
  assert.match(reason, /missing/);
  assert.match(reason, /false-positive/);
  assert.match(reason, /severity/);
  assert.match(reason, /verdict/);
});
