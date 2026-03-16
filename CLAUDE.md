# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Claude Code plugin** - a collection of production-ready agents, skills, hooks, commands, rules, and MCP configurations. The project provides battle-tested workflows for software development using Claude Code.

## Architecture

All Claude Code components are in `.claude/` following the standard directory structure:

- **.claude/agents/** - 17 specialized subagents for delegation (planner, code-reviewer, tdd-guide, etc.)
- **.claude/skills/** - 88+ workflow definitions and domain knowledge (coding standards, patterns, testing)
- **.claude/commands/** - 43 slash commands invoked by users (/tdd, /plan, /e2e, etc.)
- **.claude/rules/** - Always-follow guidelines (common + per-language: rust, golang, typescript, python, swift, kotlin, perl, php)
- **.claude/settings.json** - Hook configurations (PreToolUse, PostToolUse, SessionStart, Stop, etc.)
- **.claude/contexts/** - Context switching templates (dev, research, review)
- **.mcp.json** - MCP server configurations for external integrations
- **scripts/** - Cross-platform Node.js utilities for hooks and setup

## Core Principles

1. **Agent-First** - Delegate to specialized agents for domain tasks
2. **Test-Driven** - Write tests before implementation, 80%+ coverage required
3. **Security-First** - Never compromise on security; validate all inputs
4. **Immutability** - Always create new objects, never mutate existing ones
5. **Plan Before Execute** - Plan complex features before writing code

## Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design and scalability | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code quality and maintainability | After writing/modifying code |
| security-reviewer | Vulnerability detection | Before commits, sensitive code |
| build-error-resolver | Fix build/type errors | When build fails |
| e2e-runner | End-to-end Playwright testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation and codemaps | Updating docs |
| go-reviewer | Go code review | Go projects |
| go-build-resolver | Go build errors | Go build failures |
| database-reviewer | PostgreSQL/Supabase specialist | Schema design, query optimization |
| python-reviewer | Python code review | Python projects |
| kotlin-reviewer | Kotlin code review | Kotlin projects |
| chief-of-staff | Communication triage and drafts | Multi-channel email, Slack, LINE |
| loop-operator | Autonomous loop execution | Run loops safely, monitor stalls |
| harness-optimizer | Harness config tuning | Reliability, cost, throughput |

## Agent Orchestration

Use agents proactively without user prompt:
- Complex feature requests → **planner**
- Code just written/modified → **code-reviewer**
- Bug fix or new feature → **tdd-guide**
- Architectural decision → **architect**
- Security-sensitive code → **security-reviewer**

Use parallel execution for independent operations — launch multiple agents simultaneously.

## Key Commands

- `/tdd` - Test-driven development workflow
- `/plan` - Implementation planning
- `/e2e` - Generate and run E2E tests
- `/code-review` - Quality review
- `/build-fix` - Fix build errors
- `/learn` - Extract patterns from sessions
- `/skill-create` - Generate skills from git history

## Security Guidelines

Before ANY commit:
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- CSRF protection enabled
- Rate limiting on all endpoints

## Development Workflow

1. **Plan** — Use planner agent, identify dependencies and risks
2. **TDD** — Use tdd-guide agent, write tests first, implement, refactor
3. **Review** — Use code-reviewer agent, address CRITICAL/HIGH issues
4. **Commit** — Conventional commits format (feat/fix/refactor/docs/test/chore/perf/ci)

## Development Notes

- Package manager detection: npm, pnpm, yarn, bun (configurable via `CLAUDE_PACKAGE_MANAGER` env var)
- Cross-platform: Windows, macOS, Linux support via Node.js scripts
- Agent format: Markdown with YAML frontmatter (name, description, tools, model)
- Skill format: Markdown with clear sections for when to use, how it works, examples
- Hook format: JSON with matcher conditions in `.claude/settings.json`
- File naming: lowercase with hyphens (e.g., `python-reviewer.md`, `tdd-workflow.md`)
