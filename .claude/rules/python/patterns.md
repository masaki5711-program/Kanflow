---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Patterns

Scope: this repo's Python is the AI & Data Science service (analysis logic, local Ollama LLM orchestration).

- Structural typing via `Protocol` at service boundaries (e.g. repository interfaces); dataclasses as DTOs.
- Context managers for every resource lifetime; generators for large or streaming data.

Deeper patterns (decorators, concurrency, packaging) on demand: skill `python-patterns`.
