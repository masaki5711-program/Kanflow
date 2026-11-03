---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
---
# Rust Hooks

Wired in this repo's `.claude/settings.json` (project-scoped):

- **PostToolUse** `post:quality-gate` — runs `rustfmt` on each edited `.rs` file (check mode by default; `ECC_QUALITY_GATE_FIX=true` formats in place, `ECC_QUALITY_GATE_STRICT=true` logs check failures).

No clippy or `cargo check` hooks are wired — run `cargo clippy -- -D warnings` and `cargo check` yourself (or rely on CI) before committing.
