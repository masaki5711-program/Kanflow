---
paths:
  - "**/*.rs"
---
# Rust Testing

## Stack & organization

| Need | Convention |
|---|---|
| Unit tests | `#[cfg(test)]` module in the same source file |
| Integration tests | `tests/` (one binary per file; shared helpers in `tests/common/`) |
| Parameterized / fixtures | rstest |
| Property-based | proptest |
| Trait mocking | mockall (traits defined in production code, `pub` for integration tests) |
| Async | `#[tokio::test]` |
| Benchmarks | Criterion in `benches/` |
| Coverage | cargo-llvm-cov; ≥80% lines on business logic (exclude generated code and FFI bindings) |

## Policy

- Test names describe the behavior/scenario (`rejects_order_when_insufficient_stock`), not the function under test.
- `unwrap()` / `expect()` are permitted in test code — the production ban (coding-style.md) does not apply there.
- TDD workflow and the 80% bar: `.claude/rules/common/baseline.md`. Deeper patterns: `rust-testing` skill.
