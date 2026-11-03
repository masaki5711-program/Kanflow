---
paths:
  - "**/*.rs"
---
# Rust Security

- No hardcoded secrets. Read via environment (`std::env::var`); fail fast at startup if a required secret is missing; `.env` stays gitignored.
- SQL: parameterized queries only (sqlx/diesel/sea-orm bind parameters). Never format user, device, or sensor input into a SQL string.
- Validate at system boundaries: parse, don't validate — convert unstructured external input into typed structs (newtypes) at the boundary; reject with clear errors.
- `unsafe`: minimize. Every block carries a `// SAFETY:` comment stating all required invariants; never used to bypass the borrow checker; unjustified `unsafe` is a review flag. Prefer safe FFI wrappers around C libraries.
- Dependencies: `cargo audit` (CVEs) and `cargo deny check` (advisories/licenses); minimize crate count; audit transitive deps before adding new crates.
- Error surfaces: log detailed errors server-side with `tracing`; return generic messages to clients — never expose internal paths, stack traces, or database errors.

Data-sovereignty and manufacturing-confidential rules are owned by CLAUDE.md §2/§4 and `iotpf-git-workflow.md` §6 — not restated here.
