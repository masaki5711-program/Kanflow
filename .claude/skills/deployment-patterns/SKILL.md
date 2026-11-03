---
name: deployment-patterns
description: Shipping to production — deploy strategy selection (rolling/blue-green/canary), CI/CD stage sequencing, health checks and probes, environment configuration, rollback, and production-readiness review. Use when: planning or reviewing a release pipeline, choosing a deploy strategy, adding health/readiness endpoints, preparing a go-live, or defining rollback. Do not use when: authoring the Dockerfile or docker-compose service definitions being deployed — container build, networking, volumes, and hardening belong to docker-patterns.
origin: ECC
---

# Deployment Patterns

Getting a build into production safely, and back out again fast.

## Related (read first)

- `docker-patterns` skill — the container *build* half (images, Compose, hardening)
- `.claude/rules/iotpf-edge-operations.md` §4 — edge deploy/restart contract (on-demand rule)
- `.claude/rules/iotpf-git-workflow.md` — GitLab CI is the gate; pipelines are green before merge

## Repo-specific constraints

- **Edge (PFE/gateway) deploys must drain Store & Forward buffers before stopping the process** — see `iotpf-edge-operations.md` §4. Never restart an edge daemon with an undrained queue unless the buffer is durable and replay-safe across the version change.
- CI lives in GitLab (`.gitlab-ci.yml` per product repo), not GitHub Actions.
- Database migrations in a release follow `database-migrations` (expand-contract; backward-compatible during rollout).

## Deploy strategy selection

| Strategy | How | Rollback | Cost | Use when |
|----------|-----|----------|------|----------|
| Rolling | Replace instances gradually; both versions live during rollout | Redeploy previous version | Low | Default; changes are backward-compatible |
| Blue-green | Two identical environments; switch traffic atomically | Instant — switch back | 2x infra during deploy | Critical services, zero tolerance for bad cutover |
| Canary | Small traffic percentage to new version, widen on good metrics | Route traffic back | Traffic-splitting + monitoring infra | High traffic, risky changes, feature flags |

Rolling and canary both run two versions simultaneously — schema and API changes must be backward-compatible for the whole rollout window.

## Pipeline stage sequence

1. On MR: lint → typecheck → unit tests → integration tests → (preview deploy if available).
2. On merge to main: same gates → build image (pinned versions, cache-from registry) → deploy staging → smoke tests → deploy production.
3. Production deploy is a gated environment step; the deployed artifact is the tested image, referenced by immutable digest/SHA — never rebuilt after testing.

## Health checks

- A shallow `/health` endpoint returns 200 for liveness; a detailed variant checks each dependency (DB, cache, downstream API) and returns 503 with per-check status when degraded.
- Separate liveness (restart me) from readiness (don't route to me yet); give slow-starting services a startup grace window so they are not killed mid-boot.
- Health endpoints never require auth, never touch expensive queries, and never leak internals in production responses.

## Environment configuration

- All config via environment variables (twelve-factor); no environment-specific values in code or images.
- Validate the full env schema at startup and fail fast on missing/invalid values — a service must not boot half-configured (no silent failures, CLAUDE.md §2.5).
- Secrets injected at runtime from the host/secret store; never baked into images or committed files.

## Rollback checklist

- [ ] Previous image/artifact retained and addressable (tag or digest)
- [ ] DB migrations in this release are backward-compatible — no destructive change until the following release
- [ ] Feature flags can disable the new behavior without a deploy
- [ ] Error-rate alerts configured so regression is detected within minutes
- [ ] Rollback rehearsed in staging before the production release
- [ ] Edge components: S&F buffer drained or replay-safe across the version boundary

## Production readiness (condensed)

- [ ] All test gates green; no hardcoded secrets; structured JSON logs without PII
- [ ] Image pinned and reproducible; env schema validated at startup; resource limits set; TLS on all endpoints
- [ ] Metrics exported (rate, latency, errors); alerts on error-rate threshold; uptime check on `/health`; log aggregation searchable
- [ ] Dependencies CVE-scanned; CORS restricted; rate limiting on public endpoints; security headers set
- [ ] Rollback plan documented and tested; migration tested at production scale; runbook for common failures exists
