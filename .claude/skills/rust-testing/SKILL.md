---
name: rust-testing
description: Rust test-suite design — choosing the right test type (unit, integration, async, property-based, mocked, doc test, benchmark), TDD sequencing, and coverage verification with cargo-llvm-cov. Use when: adding or reviewing tests for Rust code, setting up coverage, or writing property/mocked tests for L1/L2 edge crates. Do not use when: deciding the TDD process itself (tdd-workflow skill / tdd-guide agent), reviewing production Rust code (rust-patterns / rust-reviewer), or judging PR test sufficiency (pr-test-analyzer agent).
origin: ECC
---

# Rust Testing Patterns

Test-type selection and suite structure for Rust. Coverage floor is the repo-wide 80%
(`common/testing.md` owns that number). Repo Rust testing conventions live in
`.claude/rules/rust/testing.md` — auto-attached on Rust files; do not restate them here.

## Related (read first)

- `.claude/rules/rust/testing.md` — repo conventions for Rust test code.
- `tdd-workflow` skill / `tdd-guide` agent — the RED→GREEN→REFACTOR process itself.
- `rust-patterns` skill — production-code design the tests exercise.

## Test-Type Decision Table

| Need | Mechanism |
|------|-----------|
| Single function/module behavior | `#[test]` in a `#[cfg(test)] mod tests` beside the code |
| Public-API behavior across the crate boundary | `tests/*.rs` (each file = separate binary; shared helpers in `tests/common/mod.rs`) |
| Same logic, many input cases | `rstest` `#[case]` parameterization; `#[fixture]` for shared setup |
| Invariants over arbitrary inputs (roundtrip, ordering, length preservation) | `proptest` with custom strategies for domain values |
| Isolating a unit from a trait dependency | `mockall` `#[automock]` on the trait; set `.times()`/`.with()` expectations |
| Async code (tokio) | `#[tokio::test]`; bound slow paths with `tokio::time::timeout` |
| API examples that must stay correct | Doc tests (`# Examples` block); `no_run` for I/O-touching examples |
| Performance regressions on hot paths | `criterion` bench in `benches/` with `harness = false` |

## TDD Sequence (per new behavior)

1. Write the failing test first; stub the implementation with `todo!()`.
2. Run and confirm the failure is the expected one (RED).
3. Minimal implementation to pass (GREEN); refactor with tests green.
4. Verify coverage: `cargo llvm-cov --fail-under-lines 80` (LCOV output for CI).

## Coverage Targets

| Code type | Target |
|-----------|--------|
| Critical business logic (SPC judgment, ETL, S&F queue) | 100% |
| Public API | 90%+ |
| General code | 80%+ |
| Generated code / FFI bindings | Excluded |

## Constraints

- Test names describe the scenario and expected outcome, not the function name.
- Error paths are first-class: assert the specific variant with `matches!`, not just `is_err()`.
- Tests returning `Result` may use `?` for cleaner failure output.
- Float comparison via epsilon tolerance, never `assert_eq!` on floats.
- Tests are independent — no shared mutable state, no required execution order.
- No `sleep()` for synchronization — use channels, barriers, or `tokio::time::pause()`.
- Prefer asserting `Result::is_err()` over `#[should_panic]`; reserve `#[should_panic]`
  (with `expected = …`) for genuinely panicking contracts.
- Don't mock everything — if the mock setup outweighs the test, write an integration test.
- Flaky tests are fixed or quarantined the day they appear, never ignored.
- Test data is synthetic — never real plant codes, edge IPs, or shop-floor captures
  (`iotpf-git-workflow.md` §6); mark fixtures as synthetic.

## Useful Invocations

- `cargo test -- --nocapture` — show stdout; `cargo test --lib` / `--test <name>` / `--doc`
  to scope; `--no-fail-fast` to see all failures; `-- --ignored` for quarantined tests.
- CI order: `cargo fmt --check` → `cargo clippy -- -D warnings` → `cargo test` →
  `cargo llvm-cov --fail-under-lines 80`.

## Review Checklist

- [ ] New behavior has a test written first (TDD), including at least one error-path case
- [ ] Test type matches the table above (no mocked unit test where integration is simpler)
- [ ] Property tests cover roundtrip/invariant claims made in docs or comments
- [ ] Coverage ≥ 80% lines; critical-path modules at their higher targets
- [ ] No sleeps, no inter-test coupling, no real manufacturing data in fixtures
