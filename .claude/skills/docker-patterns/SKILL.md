---
name: docker-patterns
description: Docker and Docker Compose authoring — Dockerfile hardening, multi-stage builds, Compose service wiring, networking, volume strategy, container secrets. Use when: writing or reviewing a Dockerfile, docker-compose file, container networking/volume/secret configuration, or debugging a container that won't build or connect. Do not use when: planning how a build ships to production — CI/CD stages, deploy strategy, health probes, rollback, readiness (deployment-patterns owns that).
origin: ECC
---

# Docker Patterns

Container authoring for local development and the on-prem runtime.

## Related (read first)

- `deployment-patterns` skill — pipeline, deploy strategy, and rollback (the *shipping* half)
- `security-review` skill — secrets and image-content checks before commit
- CLAUDE.md §4 — 24/7 restart-safety and observability requirements for long-running services

## Dockerfile checklist

- [ ] Base image pinned to a specific version tag — never `:latest`
- [ ] Rust services run on distroless or debian-slim — never Alpine/musl (allocator performance, ADR-0001 §2.7)
- [ ] Multi-stage build: deps → build → minimal production stage; dev dependencies pruned from the final image
- [ ] Non-root user created and set with USER; copied files chowned to it
- [ ] Dependency manifests copied and installed before the source copy (layer caching)
- [ ] HEALTHCHECK instruction present on service images
- [ ] `.dockerignore` excludes node_modules/target, `.git`, `.env*`, build output, coverage, tests
- [ ] No secrets in any layer — not in ENV, not in COPY'd files (layers are permanent)

## Compose for local development

- Bind-mount source for hot reload; protect container-generated directories (dependency dirs, build caches) with anonymous volumes so the bind mount does not shadow them.
- Persist stateful services (Postgres/TimescaleDB, Redis) on named volumes; init scripts mount into the engine's init directory.
- Gate service startup with `depends_on` + `condition: service_healthy`, which requires a healthcheck on the dependency.
- Keep dev-only settings (debug ports, verbose logging) in `docker-compose.override.yml` (auto-loaded); production overlays are explicit `-f` files with `restart: always` and resource limits.

## Networking rules

- Services on the same Compose network resolve each other by service name — use service names, never `localhost`, in inter-container URLs.
- Segment with named networks: the database sits only on a backend network unreachable from frontend-only services.
- Publish ports only when the host needs them; bind host-published dev ports to `127.0.0.1`; publish nothing for services that are container-internal in production.

## Volume decision table

| Need | Mechanism |
|------|-----------|
| Persist database/state across restarts | Named volume |
| Hot-reload source in dev | Bind mount |
| Keep container-built artifacts despite a bind mount | Anonymous volume over the subpath |
| One-time initialization (SQL, config) | Read-only bind mount of the script |

## Hardening (production Compose/runtime)

- [ ] `security_opt: no-new-privileges:true`
- [ ] `read_only: true` root filesystem where the app allows, with `tmpfs` for scratch paths
- [ ] `cap_drop: ALL`, adding back only what is required (e.g. NET_BIND_SERVICE for ports < 1024)
- [ ] Resource limits (CPU, memory) declared
- [ ] Secrets via runtime env injection or Docker secrets — `.env` files gitignored, never committed

## Anti-patterns

- Bare `docker compose` as a production orchestrator for multi-node workloads — use a real orchestrator; single-node on-prem Compose needs `restart` policies and healthchecks at minimum.
- Data written inside the container without a volume — lost on recreate.
- Running as root; `:latest` tags; one mega-container running several processes.
- Secrets hardcoded in the compose file or image.
- Debugging by rebuilding blind — first `logs -f`, `exec` a shell, check DNS resolution of the peer service name, and inspect the network.
