---
name: security-review
description: Application-security review checklist — secrets handling, input validation, injection/XSS/CSRF prevention, authN/authZ, rate limiting, sensitive-data exposure, dependency hygiene. Use when: adding authentication, handling user input or file uploads, creating API endpoints, touching secrets or sensitive data, or before a production deploy. Do not use when: scanning a diff for manufacturing-confidential egress or credentials before commit (the data-sovereignty-guard agent is mandatory pre-commit and owns that), LLM/RAG-specific threats (llm-security-reviewer agent), or cloud/IaC hardening (see cloud-infrastructure-security.md in this skill).
origin: ECC
---

# Security Review

Checklist-driven review of application code. Complements — never replaces — the
`data-sovereignty-guard` agent, which is **mandatory before every commit** for
egress/secret/confidential-content detection (CLAUDE.md §2, iotpf-git-workflow §6).

## Related (read first)

- `data-sovereignty-guard` agent — pre-commit egress gate (mandatory; this skill does not cover it)
- `security-reviewer` agent — deep OWASP review of specific code; `llm-security-reviewer` for AI-service surfaces
- `cloud-infrastructure-security.md` (this skill's directory) — cloud/IaC hardening reference
- CLAUDE.md §2/§4 — data sovereignty and external-MCP boundary (product hard rules)

## Review areas and gates

1. **Secrets** — no hardcoded keys/passwords/tokens anywhere; all secrets from env or a secret manager; presence validated at startup; `.env*` gitignored; none in git history; exposed secrets rotated, not just removed.
2. **Input validation** — every boundary input schema-validated before use; whitelist, not blacklist; file uploads restricted by size, MIME type, and extension; validation errors never echo internals.
3. **SQL injection** — parameterized queries or query builder only; zero string concatenation/interpolation of user input into SQL.
4. **Authentication & authorization** — tokens in httpOnly+Secure+SameSite cookies, never localStorage; authorization checked server-side before every sensitive operation, not just in UI; RLS enabled where the datastore supports it; sessions expire.
5. **XSS** — user-provided HTML sanitized with an allowlist before rendering; CSP headers configured; no unvalidated dynamic HTML injection.
6. **CSRF** — tokens on state-changing requests; SameSite=Strict cookies.
7. **Rate limiting** — all public endpoints limited; stricter limits on expensive operations (search, LLM calls, exports); both IP-based and per-user for authenticated routes.
8. **Sensitive-data exposure** — no passwords/tokens/PII in logs; user-facing errors generic, detailed context server-side only; no stack traces to clients.
9. **Dependencies** — lockfiles committed; audit clean of known CVEs; installs in CI use the lockfile-exact command.

## Security testing

Add automated tests asserting: unauthenticated requests to protected routes return 401; wrong-role requests return 403; invalid input returns 400; rate limits actually produce 429 under burst. Error paths are test targets, not afterthoughts.

## Pre-deployment checklist

- [ ] Secrets: none hardcoded, all env-injected, startup-validated
- [ ] All inputs validated; uploads restricted
- [ ] All queries parameterized
- [ ] Token storage httpOnly; authZ enforced server-side; RLS on
- [ ] XSS: sanitization + CSP; CSRF: tokens + SameSite
- [ ] Rate limiting live on every public endpoint
- [ ] Errors and logs free of sensitive data
- [ ] Dependencies audited; lockfile committed
- [ ] HTTPS enforced; security headers (CSP, HSTS, X-Frame-Options) set
- [ ] `data-sovereignty-guard` run on the final diff before commit

## Escalation

Any CRITICAL finding (per the severity vocabulary in `.claude/rules/common/baseline.md`): stop, fix before continuing, rotate anything exposed, then sweep the codebase for the same pattern.
