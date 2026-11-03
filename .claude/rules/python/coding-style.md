---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Coding Style

- PEP 8. Type annotations required on every function signature; public APIs are non-negotiable.
- Prefer immutable data structures (frozen dataclasses, NamedTuple) over mutable shared state.
- Toolchain: **ruff** (lint), **black** (format), **isort** (imports). Do not fight or reconfigure them ad hoc.

Deeper idioms on demand: skill `python-patterns`.
