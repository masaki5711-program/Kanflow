---
name: claude-api
description: LLM API design principles (message structure, tool-use loops, streaming, context budgeting, model routing) as a design reference for this repo's AI service, whose runtime LLM is LOCAL Ollama — not a cloud-integration guide. Use when: designing the AI service's LLM orchestration, Flow B tool-call loops, prompt/context structure, or an Ollama client abstraction. Do not use when: the change would send manufacturing data to an external LLM API (forbidden — data sovereignty, CLAUDE.md §2), LLM/RAG security review (llm-security-reviewer agent), cost/routing policy detail (cost-aware-llm-pipeline), or questions about Claude Code / Agent SDK itself (claude-code-guide agent).
origin: ECC
---

# Claude API — Design Principles for a Local-LLM Runtime

This skill is a **design-principles reference, not an integration guide**: the
product's deep-dive LLM is local Ollama (CLAUDE.md §1.4/§2). Anthropic's API
conventions are used here as the design template for the Ollama orchestration
layer, because they are the cleanest published contract for the same problems.

## Related (read first)

- `llm-security-reviewer` agent — owns prompt-injection, exfiltration, and Flow B tool-boundary review; do not re-derive that checklist here.
- `cost-aware-llm-pipeline` skill — owns model routing by task complexity and budget tracking.
- `iterative-retrieval` skill — owns RAG/context refinement strategy.
- CLAUDE.md §1.4 Flow B — the tool-use loop this service actually runs: anomaly → integration LLM → Edge MCP tools → context-rich alert.

## Sovereignty boundary (hard rule)

- No manufacturing data (raw waveforms, plant identifiers, 4M records, alerts) may reach any external LLM endpoint — Anthropic's included. There is no cloud-LLM code path in this product.
- The only sanctioned Anthropic usage in this repo is the **agent-model eval harness** (Claude Code auth, synthetic fixtures only — see iotpf-self-improvement.md). Never blend that path into product code.
- Treat any new `anthropic`/`@anthropic-ai/sdk` import in `apps/` product code as a review blocker; route it to `data-sovereignty-guard` before commit.

## Design principles to carry into the Ollama layer

| Concern | Principle |
|---|---|
| Conversation shape | Explicit role-tagged message array; system prompt separate from turns; full history resent per call (the API is stateless — design storage accordingly) |
| Tool use | Tools declared as name + description + JSON Schema; model returns a tool-call request; caller executes and appends a result message; loop until a terminal stop reason. In this product the toolset is the Edge MCP servers (Flow B) — the LLM never gets DB credentials or raw SQL |
| Stop conditions | Bound every agentic loop: max turns, max tokens, wall-clock timeout. An unbounded loop on a 24/7 service is a silent-failure risk |
| Streaming | Stream for operator-facing latency; cost/logic identical to non-streaming — choose per UX, not per budget |
| Context budget | Set explicit max-token limits per call; summarize or retrieve (iterative-retrieval) instead of growing history unboundedly |
| Caching | Static prefix (system prompt, tool defs) first, variable content last — the ordering discipline pays off in any KV-cache runtime, Ollama included |
| Model routing | Small model for classification/extraction, large for deep-dive reasoning — policy in cost-aware-llm-pipeline; applies to local model sizes too |
| Errors | Typed error taxonomy (rate/connection/API), bounded retry with backoff, timeout on every call — factory-LAN rules apply to localhost Ollama as well |
| Structured output | Constrain via schema (tool-call or format parameter) rather than parsing free text; validate the result at the boundary anyway |

## Design checklist for LLM-touching code

- [ ] Endpoint is local (Ollama / Edge MCP); no external LLM host reachable from the data path.
- [ ] Agentic loop has explicit turn, token, and time bounds.
- [ ] Tool results validated before re-entering the loop; tool errors surface as logged events, not swallowed turns.
- [ ] Prompt assembly keeps retrieved/edge content clearly delimited from instructions (injection surface — then hand to llm-security-reviewer).
- [ ] Model choice and context limits are config, not hardcoded.
