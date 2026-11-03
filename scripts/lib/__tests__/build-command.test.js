'use strict';

// Tests for the build-core reduction mistake memory keys failures under.
// Commands are synthetic. Node built-in test runner only.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildCore, beforePipe } = require('../build-command');

test('drops cd, redirections and everything after a pipe', () => {
  assert.equal(
    buildCore('cd "/work/My Project(X)/apps/a" && cargo test -p zeva-runtime --test runner 2>&1 | tail -40'),
    'cargo test -p zeva-runtime --test runner',
  );
  assert.equal(buildCore('npm run test:cov-gate 2>&1 | grep -E "fail|ok"'), 'npm run test:cov-gate');
  assert.equal(buildCore('pytest -q > out.txt'), 'pytest -q');
});

test('the same build with different wrappers reduces to one core', () => {
  const a = buildCore('cd /w && cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -5');
  const b = buildCore('cargo clippy --workspace --all-targets -- -D warnings 2>&1 | grep warning');
  assert.equal(a, b);
});

test('drops env assignments and runner wrappers', () => {
  assert.equal(buildCore('DATABASE_URL=postgres://u:p@h/db RUST_LOG=debug cargo test -p x'), 'cargo test -p x');
  assert.equal(buildCore('npx tsc --noEmit'), 'tsc --noEmit');
  assert.equal(buildCore('uv run pytest tests/'), 'pytest tests/');
  assert.equal(buildCore('python -m pytest -x'), 'python -m pytest -x');
});

test('keeps only the build segments of a compound command', () => {
  assert.equal(buildCore('cargo fmt --all && cargo test -p zeva-replay 2>&1 | tail -3'), 'cargo test -p zeva-replay');
  assert.equal(buildCore('npm run lint && npm run build'), 'npm run lint && npm run build');
});

test('a build word inside an argument, script or heredoc is not a build', () => {
  assert.equal(buildCore('grep -rn "cargo test" docs'), '');
  assert.equal(buildCore('node -e "const re=/node --test/"'), '');
  assert.equal(buildCore("python - <<'EOF'\nprint('cargo test')\nEOF"), '');
  assert.equal(buildCore('echo npm run build'), '');
  assert.equal(buildCore('git status'), '');
  assert.equal(buildCore(''), '');
  assert.equal(buildCore(undefined), '');
});

test('make / gradle / dotnet / go heads are recognized', () => {
  assert.equal(buildCore('make -j4'), 'make -j4');
  assert.equal(buildCore('./gradlew test'), './gradlew test');
  assert.equal(buildCore('dotnet test'), 'dotnet test');
  assert.equal(buildCore('go vet ./...'), 'go vet ./...');
  assert.equal(buildCore('makefile-lint'), '');
});

test('beforePipe ignores a pipe inside quotes', () => {
  assert.equal(beforePipe('cargo test "a|b" | tail'), 'cargo test "a|b" ');
  assert.equal(beforePipe("cargo test 'x|y'"), "cargo test 'x|y'");
});
