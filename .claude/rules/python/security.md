---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Security

- Secrets come from environment variables only; fail fast at startup when a required secret is missing. Never hardcode.
- Static security scan: **bandit**.
- LLM/RAG code (prompt construction, retrieval, Ollama orchestration, Edge-MCP tool calls) is reviewed by the `llm-security-reviewer` agent — the data-sovereignty boundary it enforces is defined in CLAUDE.md §2, not here.
