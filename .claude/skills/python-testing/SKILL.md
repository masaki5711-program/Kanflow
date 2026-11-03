---
name: python-testing
description: pytest test-suite design for this repo's AI & Data Science service — fixture scoping, parametrization, mocking boundaries, async tests, marker taxonomy. Use when: designing, writing, or reviewing Python tests or test infrastructure. Do not use when: deciding the TDD process itself (tdd-workflow skill / tdd-guide agent), reviewing production Python code (python-patterns / python-reviewer), or judging PR test sufficiency (pr-test-analyzer agent).
origin: ECC
---

# Python Testing

Suite-design decisions only. pytest syntax and mock mechanics are assumed known.

## Related (read first)

- Coverage bar (80%, critical paths 100%) is owned by `.claude/rules/common/baseline.md` — do not restate or vary it here.
- `tdd-workflow` skill / `tdd-guide` agent — own the red-green-refactor process.
- `pr-test-analyzer` agent — owns "are these tests sufficient" review on MRs.
- LLM/RAG test surfaces: security cases belong to `llm-security-reviewer`; all fixtures for it are synthetic (never real waveforms/plant data — iotpf-git-workflow §6).

## Repo-specific constraints

- Test data is **synthetic and marked as such** in fixtures/comments. Real shop-floor values, plant codes, edge IPs, or lot numbers in a fixture are a data-sovereignty leak, not a test smell.
- Tests must not call external services — the AI service's only LLM is local Ollama, and even that is mocked in unit tests; anything network-shaped is mocked or marked `integration`.
- Timezone behavior is a first-class test target: include non-UTC and cross-plant-TZ cases for any code touching timestamps.
- Failure paths are tested, not just happy paths — "no silent failures" (CLAUDE.md §2) means every except-branch that logs/notifies gets a test asserting it does.

## Decision table

| Situation | Choice |
|---|---|
| Shared setup across a test file/package | fixture in `conftest.py`, narrowest scope that works |
| Expensive resource (model load, DB engine) | `session`/`module` scope fixture; never share mutable state between tests |
| Same logic, many inputs | `parametrize` with readable `ids`, one behavior per test |
| Setup that must run for every test | `autouse` fixture — use sparingly, it hides dependencies |
| External API / DB / Ollama call | mock at the boundary you own, with `autospec=True` |
| Async code | `pytest-asyncio`; assert with `assert_awaited_*` |
| Temp files/dirs | `tmp_path` fixture, never hand-rolled tempfile cleanup |
| Slow / networked tests | mark (`slow`, `integration`) and exclude from the default run |
| Expected exception | `pytest.raises` with `match=`; never try/except in a test |

## Suite structure

- Layout: `tests/unit/`, `tests/integration/`, `tests/e2e/`; shared fixtures in `conftest.py`; markers declared in config (`--strict-markers`).
- Test behavior, not implementation; over-specific mocks (asserting internal call sequences) are brittleness, flag on review.
- One assertion theme per test; name tests as behavior sentences.
- AAA structure (Arrange-Act-Assert) per `.claude/rules/common/`.

## Review checklist

- [ ] Coverage meets the baseline bar; critical paths covered including error branches.
- [ ] No test depends on another test's state or on execution order.
- [ ] Mocks use autospec; no mock of code under test itself.
- [ ] All fixtures synthetic; no confidential values.
- [ ] Slow/integration tests marked and excluded from default run.
- [ ] TZ edge cases present where timestamps are handled.
