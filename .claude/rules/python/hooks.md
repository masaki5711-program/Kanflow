---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Hooks (as wired in .claude/settings.json)

- `post:quality-gate` — runs ruff on each edited `.py` file (fails open if ruff is absent).
- `stop:format-typecheck` — one batched `ruff check` per pyproject root over session-edited `.py` files (diagnostic, non-blocking).
- `pre:config-protection` — blocks edits to linter/formatter configs, including `ruff.toml` / `.ruff.toml`.
- `pre:edit:generated-guard` — blocks hand-edits to generated `*_pb2.py` / `*_pb2_grpc.py`.

Ruff is the only automated Python check; no black/isort/mypy/pyright hooks are wired.
