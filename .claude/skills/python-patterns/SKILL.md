---
name: python-patterns
description: Decision guide for idiomatic, maintainable Python in this repo's AI & Data Science service (local Ollama LLM, analysis pipelines). Use when: writing, reviewing, or refactoring Python application code — construct selection, error-handling design, concurrency model choice, package layout. Do not use when: writing or designing tests (python-testing), PyTorch model/training code (pytorch-patterns), LLM orchestration design (claude-api), or LLM/RAG security review (llm-security-reviewer agent).
origin: ECC
---

# Python Patterns

Decision criteria only — no code samples. The model already knows the syntax;
this file settles which construct to reach for and what this repo forbids.

## Related (read first)

- `.claude/rules/python/` — on-demand language rules (auto-attach via `paths:`); they own style detail.
- `python-reviewer` agent — owns Python code review; do not re-derive a review checklist here.
- CLAUDE.md §2/§4 — data sovereignty, no-silent-failure, TZ-aware timestamps, i18n. Those rules win.
- `llm-security-reviewer` agent — owns prompt-injection / exfiltration / tool-boundary review.

## Repo-specific constraints (non-negotiable)

- This service's LLM is **local Ollama only**. Never add an external LLM/API call path for manufacturing data — data sovereignty (CLAUDE.md §2) forbids it regardless of convenience.
- Every external call (HTTP, DB, MQTT, Ollama) carries an explicit timeout; factory LAN is unstable.
- No silent failures: never swallow an exception without logging a notifiable, structured event.
- Datetimes are always timezone-aware; naive `datetime.now()` is a defect, not a style issue.
- No hardcoded user-facing strings (JA/EN/ID i18n) and no secrets in source.

## Construct selection

| Need | Reach for | Not |
|---|---|---|
| Data container, mutable/validated | `dataclass` (+ `__post_init__` or pydantic at boundaries) | bare dict passed around |
| Small immutable record | `NamedTuple` or frozen dataclass | tuple with positional meaning |
| Structural typing across modules | `Protocol` | inheritance-only ABC coupling |
| Large/streaming data | generator / iterator | building full lists in memory |
| Concurrent I/O (many sockets/requests) | `asyncio` | thread-per-connection |
| Blocking I/O, few tasks | `ThreadPoolExecutor` | asyncio retrofit of sync libs |
| CPU-bound work | `ProcessPoolExecutor` (or push to Rust layer) | threads (GIL) |
| Resource lifetime | context manager (`with`) | manual try/finally close |
| Complex string parsing | see `regex-vs-llm-structured-text` skill | ad-hoc LLM call |

## Error-handling design

- Define one app-level exception base per package; raise specific subclasses.
- Catch specific exceptions; chain with `raise ... from` to keep the traceback.
- Validate at boundaries (schema-based where possible), fail fast with a clear message.
- EAFP over look-before-you-leap, except where the "ask forgiveness" path hides a real error class.

## Anti-patterns (one line each, all are review blockers)

- Bare `except:` or `except Exception: pass`.
- Mutable default arguments.
- `type(x) ==` instead of `isinstance`; `== None` instead of `is None`.
- `from module import *`.
- String concatenation in loops (use join/StringIO).
- Unbounded queues/buffers on stream consumers (CLAUDE.md §4).
- Module-level side effects at import time (hidden setup).

## Completion checklist

- [ ] Public functions fully type-hinted (modern builtin generics); mypy clean.
- [ ] Formatter/linter pass (ruff or black+isort per project config).
- [ ] Timeouts on every external call; errors logged with context, never swallowed.
- [ ] No naive datetimes, no hardcoded UI strings, no secrets.
- [ ] Tests exist — hand off to `python-testing` / `tdd-workflow`.
