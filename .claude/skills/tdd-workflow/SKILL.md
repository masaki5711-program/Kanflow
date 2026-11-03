---
name: tdd-workflow
description: Test-driven development procedure — RED-GREEN-REFACTOR gates with git checkpoints and coverage verification. Use when: writing new features, fixing bugs, or refactoring production code in any layer. Do not use when: choosing language-specific test idioms or frameworks (rust-testing / python-testing / e2e-testing), or judging an existing MR's test sufficiency (pr-test-analyzer agent).
origin: ECC
---

# Test-Driven Development Workflow

Tests come before production code. The coverage bar and its scope are owned by
`.claude/rules/common/baseline.md` — this skill defines the procedure only.

## Related (read first)

- `.claude/rules/common/baseline.md` — coverage bar (single source; not restated here)
- `tdd-guide` agent — enforces this workflow interactively
- Language-specific test skills: `rust-testing`, `python-testing`, `e2e-testing`

## Procedure

1. **Write user journeys** — role, action, benefit — for the feature or bug.
2. **Generate test cases** per journey: happy path, edge cases (null/empty/boundary), error paths, fallback behavior. Pick the test type from the table below.
3. **RED** — run the new/changed test and confirm it fails *for the intended reason* (see RED validity below). Do not touch production code before this gate.
4. **Checkpoint (git)** — commit the reproducer, e.g. `test: add reproducer for <feature|bug>`. This commit is the RED evidence.
5. **GREEN** — write the minimal implementation; rerun the *same* test target; confirm the previously failing test now passes.
6. **Checkpoint (git)** — commit the fix, e.g. `fix: <feature|bug>`. This commit is the GREEN evidence.
7. **REFACTOR** — remove duplication, improve naming, optimize; tests stay green throughout.
8. **Checkpoint (git, optional)** — `refactor: clean up after <feature|bug>`.
9. **Verify coverage** against the bar in `baseline.md`; close gaps with new tests, not exclusions.

## RED validity

A test that was only written — never compiled and executed — does not count as RED. Accept either:

- **Runtime RED**: the test target compiles, the new test actually runs, and it fails because of the intended missing behavior or bug.
- **Compile-time RED**: the new test newly references or exercises the buggy code path and the compile failure *is* the intended signal.

Failures caused only by unrelated syntax errors, broken setup, missing dependencies, or unrelated regressions are not RED.

## Checkpoint rules

- Checkpoints apply only when the repository is under git; never squash or rewrite them until the cycle completes.
- Count only commits on the current active branch for the current task; verify each checkpoint is reachable from `HEAD` before continuing.
- Separate evidence-only commits are unnecessary when the test commit clearly corresponds to RED and the fix commit to GREEN.

## Test type selection

| Type | Covers | Typical target |
|------|--------|----------------|
| Unit | Single function/component logic, pure functions | Utilities, component behavior |
| Integration | API endpoints, DB operations, service interactions | Route handlers, repositories |
| E2E | Critical user flows through real UI/API | Playwright journeys (see `e2e-testing`) |

## Quality rules

- Test user-visible behavior, never internal state or implementation details.
- One behavior per test; descriptive names that state the expected behavior; Arrange-Act-Assert structure.
- Tests are independent — each sets up its own data; no ordering dependencies, no shared mutable state.
- Mock external dependencies in unit tests; use semantic selectors (role, text, test-id) in E2E, never style classes.
- No skipped or disabled tests at completion; clean up side effects.

## Completion checklist

- [ ] RED was observed and checkpointed before any production edit
- [ ] GREEN confirmed by rerunning the same test target
- [ ] Coverage meets the `baseline.md` bar; no gaps in error paths
- [ ] All tests pass; none skipped or disabled
- [ ] Checkpoint commits exist on the active branch in RED→GREEN(→REFACTOR) order
