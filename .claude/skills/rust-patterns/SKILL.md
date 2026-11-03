---
name: rust-patterns
description: Decision guidance for idiomatic Rust — error-type selection, ownership/borrowing choices, enum state modeling, dispatch strategy, concurrency primitive choice, unsafe policy, and crate layout. Use when: writing, reviewing, or refactoring Rust code, especially L1/L2 edge/gateway daemons and L3 high-load modules. Do not use when: writing tests (rust-testing), fixing compile errors (rust-build-resolver agent), or working on Tauri IPC/commands (tauri-patterns).
origin: ECC
---

# Rust Development Patterns

Decision criteria for Rust design choices. Detailed conventions (naming, lint config, doc
comments, module hygiene) are owned by `.claude/rules/rust/` — auto-attached when Rust files
are touched; do not restate them here.

## Related (read first)

- `.claude/rules/rust/` — repo Rust conventions (coding-style, patterns, security, testing, hooks).
- `.claude/rules/iotpf-edge-operations.md` — factory-LAN resilience contract for L1/L2 daemons
  (timeouts, Store & Forward, restart-safety). That file owns those rules; this skill only points.
- `rust-reviewer` agent for review; `rust-testing` skill for test authoring.

## Decision Tables

### Error handling

| Context | Choice |
|---------|--------|
| Library / reusable crate | `thiserror` typed enum; implement `From` for wrapped sources |
| Application / binary | `anyhow::Result` with `.context()` at every fallible call |
| Production code path | `?` propagation — `unwrap()`/`expect()` forbidden |
| Startup-only invariants (config load, listener bind) | `expect()` with a message acceptable |
| Discarding a `Result` | Never silent — handle, log, or return it (no `let _ =` on fallible ops) |

### Ownership

| Need | Choice |
|------|--------|
| Read-only access | `&T` / `&[T]` / `&str` — never take `String`/`Vec` just to read |
| Store or consume the value | Take ownership by value |
| Sometimes-modified string/slice | `Cow<'_, T>` — allocate only on the mutating branch |
| Clone to silence the borrow checker | Stop — restructure lifetimes instead |

### Dispatch

| Need | Choice |
|------|--------|
| Hot path, known types at compile time | Generics (monomorphized, zero-cost) |
| Heterogeneous collection / plugin registry | `Box<dyn Trait>` (require `Send + Sync` if crossed threads) |
| Function inputs | Accept `impl Trait` / generics; return concrete types |

### Concurrency

| Need | Choice |
|------|--------|
| Shared mutable state, few writers | `Arc<Mutex<T>>`; `RwLock` only if read-heavy and measured |
| Producer→consumer pipeline | Bounded channel (`mpsc::sync_channel` / tokio bounded) — unbounded channels are a memory-leak vector (CLAUDE.md §4) |
| I/O concurrency | async/tokio; every await on an external call wrapped in `tokio::time::timeout` |
| Blocking work inside async | `spawn_blocking` — never `std::thread::sleep` or sync I/O on the executor |

## Constraints (non-negotiable)

- Model states as enums; make illegal states unrepresentable. No wildcard `_` arm on
  business-critical enums — a new variant must force a compile error.
- Newtype wrappers for IDs and units that could be swapped (`UserId`, `EdgeId`, ms vs s).
- Parse, don't validate: convert external data into typed structs at the boundary.
- `unsafe` only at FFI boundaries or measured hot paths, always with a `// SAFETY:` comment
  stating the upheld invariant. Never to bypass the borrow checker, never `transmute`
  between unrelated types.
- Visibility: minimal `pub`; internal sharing via `pub(crate)`; re-export the public API
  from `lib.rs`. Organize modules by domain, not by type.

## Anti-Patterns (one-line each)

- `unwrap()` on anything reachable in production, including map lookups and lock poisoning.
- `Box<dyn Error>` in a library's public API (use `thiserror`).
- `String` parameter where `&str` suffices; `&Vec<T>` where `&[T]` suffices.
- Manual index loops where an iterator chain is clearer; `collect()` without a target type.
- Holding a `std::sync` lock guard across an `.await`.
- Ignoring `#[must_use]` warnings on `Result`-returning calls.

## Pre-Review Checklist

- [ ] No `unwrap()`/`expect()` outside startup and tests
- [ ] All external calls have timeouts; channels bounded
- [ ] Enums exhaustively matched; no business-logic wildcard arms
- [ ] `unsafe` blocks carry `// SAFETY:` justification
- [ ] Public surface minimal; errors typed per the table above
