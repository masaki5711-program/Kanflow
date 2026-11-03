'use strict';

// Regression tests for the GitLab MR Conventional-Commit guard. Guards the two
// real failure modes: default merge text leaking into MR fields, and non-CC
// titles that block squash-merge. Node built-in test runner only.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const mrValidate = require('../pre-bash-mr-validate');
const lib = require('../../lib/mr-conventional');

function bash(command) {
  return JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
}
function exitOf(command) {
  return mrValidate.run(bash(command)).exitCode;
}

// --- pass-through (not an MR command) -------------------------------------

test('passes through a non-glab command', () => {
  assert.equal(exitOf('git status'), 0);
});

test('passes through glab non-create commands', () => {
  assert.equal(exitOf('glab mr list'), 0);
});

// --- the trigger string inside another command must NOT fire ---------------

test('does not trigger on glab mr create inside a git commit message', () => {
  assert.equal(exitOf('git commit -m "feat: add MR guard for glab mr create"'), 0);
});

test('does not trigger on glab mr create inside an echo string', () => {
  assert.equal(exitOf('echo "run: glab mr create --fill"'), 0);
});

test('does not trigger on a grep for the literal', () => {
  assert.equal(exitOf('grep -r "glab mr create" scripts/'), 0);
});

// --- valid MRs are allowed ------------------------------------------------

test('allows a well-formed MR', () => {
  assert.equal(exitOf(
    'glab mr create --title "feat(l3): add spc moving window" ' +
    '--description "Adds the SPC moving-standard-deviation window to ZEVA-Engine. Includes abnormal-path tests." ' +
    '--target-branch main'), 0);
});

test('allows scope-less and breaking-change titles', () => {
  assert.equal(lib.validateTitle('fix: reconnect gateway after blip').filter(i => i.severity === 'error').length, 0);
  assert.equal(lib.validateTitle('feat(l1)!: drop legacy frame format').filter(i => i.severity === 'error').length, 0);
});

test('accepts command-substitution description (e.g. cat template)', () => {
  assert.equal(exitOf(
    'glab mr create --title "chore: refresh deck" --description "$(cat .gitlab/merge_request_templates/default.md)"'), 0);
});

// --- default merge text is blocked ----------------------------------------

test('blocks GitLab default merge text in title', () => {
  assert.equal(exitOf(
    "glab mr create --title \"Merge branch 'feat/x' into 'chore/y'\" --description \"some real body here\""), 2);
});

test('blocks default merge text in description', () => {
  assert.equal(exitOf(
    'glab mr create --title "feat: real title" --description "Merge branch \'feat/x\' into main"'), 2);
});

// --- Conventional Commits violations are blocked --------------------------

test('blocks uppercase subject', () => {
  assert.equal(exitOf('glab mr create --title "feat: Add login flow" --description "a meaningful body here"'), 2);
});

test('blocks trailing period', () => {
  assert.equal(exitOf('glab mr create --title "fix: patch the leak." --description "a meaningful body here"'), 2);
});

test('blocks missing/unknown type', () => {
  assert.equal(exitOf('glab mr create --title "update the readme" --description "a meaningful body here"'), 2);
});

// --- description structure ------------------------------------------------

test('blocks --fill with no explicit description', () => {
  assert.equal(exitOf('glab mr create --fill'), 2);
});

test('blocks missing description', () => {
  assert.equal(exitOf('glab mr create --title "feat: add thing"'), 2);
});

test('blocks trivial one-word description', () => {
  assert.equal(exitOf('glab mr create --title "feat: add thing" --description "wip"'), 2);
});

// --- fail-open ------------------------------------------------------------

test('fails open on malformed JSON', () => {
  assert.equal(mrValidate.run('not json at all').exitCode, 0);
});

// --- #1 fix: no false positive on acronym / tech-name / product-noun leads --

test('allows ALL-CAPS acronym-led subject (README, API)', () => {
  assert.equal(lib.validateTitle('docs: README cleanup').filter(i => i.severity === 'error').length, 0);
  assert.equal(lib.validateTitle('feat(api): API gateway routing').filter(i => i.severity === 'error').length, 0);
});

test('allows CamelCase tech-name lead (TypeScript)', () => {
  assert.equal(lib.validateTitle('fix: TypeScript types drift').filter(i => i.severity === 'error').length, 0);
});

test('allows known product-noun lead (Rust, Docker)', () => {
  assert.equal(lib.validateTitle('chore: Rust toolchain bump').filter(i => i.severity === 'error').length, 0);
  assert.equal(lib.validateTitle('fix: Docker healthcheck timing').filter(i => i.severity === 'error').length, 0);
});

test('still blocks genuine Sentence-case prose lead (Add)', () => {
  assert.equal(lib.validateTitle('feat: Add login flow').filter(i => i.severity === 'error').length, 1);
});

// --- #2 fix: target-branch must be main / release/* ------------------------

test('blocks MR targeting a sibling branch', () => {
  assert.equal(exitOf('glab mr create --title "feat: add x" --description "a meaningful body here" --target-branch chore/infra'), 2);
});

test('allows MR targeting main', () => {
  assert.equal(exitOf('glab mr create --title "feat: add x" --description "a meaningful body here" --target-branch main'), 0);
});

test('allows MR targeting a release line', () => {
  assert.equal(exitOf('glab mr create --title "fix: patch leak" --description "a meaningful body here" -b release/2026.1'), 0);
});

// --- arg extraction edge cases --------------------------------------------

test('parses --title= inline form and -t short form', () => {
  assert.equal(lib.extractMrArgs('glab mr create --title=feat:x -d "body"').title, 'feat:x');
  assert.equal(lib.extractMrArgs('glab mr create -t "feat: y" -d "body"').title, 'feat: y');
});
