---
paths:
  - "**/*.rs"
---
# Rust Patterns

Conventions this repo enforces (the idioms themselves are assumed known):

- Data access behind traits (`Send + Sync`) so storage backends (Postgres, SQLite, in-memory for tests) are swappable; business logic in service structs with constructor-injected dependencies.
- Newtypes for domain identifiers — never pass bare `u64`/`String` IDs across function boundaries.
- Model connection/protocol state as enums; make illegal states unrepresentable.
- Match exhaustively on business-critical enums — no `_` wildcard arm; a new variant must force a compile error, not a silent fallthrough.
- Builder pattern for config structs with several optional fields; sealed traits when external implementations must be prevented.
- Consistent API response envelope (status-tagged ok/error) for any HTTP surface.

L1 (edge/HMI) and L2 (gateway) are this repo's Rust layers. Their operational contracts — Store & Forward, timeouts, observability — live in `.claude/rules/iotpf-edge-operations.md`; do not restate them here.

Broader idioms on demand: `rust-patterns` skill.
