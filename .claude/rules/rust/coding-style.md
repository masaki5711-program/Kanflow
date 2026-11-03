---
paths:
  - "**/*.rs"
---
# Rust Coding Style

## Toolchain

- `cargo fmt` before commit; `cargo clippy -- -D warnings` (warnings are errors). rustfmt defaults (4-space indent, 100 cols).

## Ownership & `.clone()` (MUST)

- Borrow by default: `&str` over `String`, `&[T]` over `Vec<T>` in parameters; take ownership only to store or consume; `impl Into<String>` for owning constructors.
- **Never add `.clone()` to silence the borrow checker.** Fix ownership first: borrow, move, restructure the lifetime, split the borrow, or `Rc`/`Arc` when sharing is genuine.
- A deliberate `.clone()` MUST carry an inline comment stating why borrow/move cannot work. A bare `.clone()` is a review BLOCK (`rust-reviewer`). Matters most on the edge hot path — per-sample clones inflate latency under high-frequency streams (CLAUDE.md §4).

## Error Handling (MUST — L1/L2 edge processes run 24/7 unattended)

- `unwrap()` / `expect()` forbidden in production paths. Parse, lock, channel, index, and I/O results return `Result` and propagate with `?`.
- Allowed only in tests, `build.rs`, or on provably infallible values — and then `expect("<invariant>")` must state the invariant. A bare production `unwrap()` is a review BLOCK.
- `panic!`, `todo!`, `unreachable!`, and unchecked indexing on external/sensor input are the same defect class — use `get()`, `?`, or a typed error.

| Crate kind | Error strategy |
|---|---|
| Library | Typed errors via `thiserror` |
| Application / binary | `anyhow` with `.context()` / `.with_context()` |

## Conventions

- Standard Rust naming: `snake_case` / `PascalCase` / `SCREAMING_SNAKE_CASE`; short lowercase lifetimes.
- `let` over `let mut`; prefer returning new values over in-place mutation.
- Modules organized by domain, not by type. Default private; `pub(crate)` for internal sharing; re-export the public API from `lib.rs`.

Factory-LAN resilience and edge-operations contracts: `.claude/rules/iotpf-edge-operations.md` — do not duplicate here.
