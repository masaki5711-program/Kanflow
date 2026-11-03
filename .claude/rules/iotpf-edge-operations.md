---
# On-demand (CLAUDE.md §9): attach for edge/gateway (L1/L2) and daemon work.
paths:
  - "apps/edge/**"
  - "apps/hub/**"
  - "**/*.rs"
---

# IoTPF / ZEVA-Link — Edge Operations (abnormal-case hardening)

> **On-demand rule — NOT `@`-imported** (context budget, CLAUDE.md §9). Every
> rule here is scoped to edge/gateway/daemon code, so it auto-attaches when
> those files are touched. CLAUDE.md §2 (no silent failures) and §4 carry the
> always-loaded summary; the layer routing table names the enforcing agents.

The hard part of moving from synchronous web to the always-on factory floor is
the **abnormal path**: network blips, malformed data, and sudden restarts. These
rules are MUST for edge / gateway (L1/L2) and any 24/7 daemon. They extend
[CLAUDE.md](../../CLAUDE.md) §2 (no silent failures) and §4 (system-construction
cautions). When this file and `common/` conflict, this file wins.

## 1. Store & Forward — never lose a production sample (MUST)

A factory LAN drops for seconds (noise, hub faults). If the link to the
ZEVA-Link DB is down at the instant an Omron FH / PLC pushes data, the relay
**must buffer locally and re-send on recovery** — a gap in the data silently
corrupts OEE / cycle-time (CT) math downstream.

- Every edge → DB / edge → gateway path has a **durable** local buffer
  (SQLite / file ring buffer; in-memory alone is lost on power-cycle).
- The buffer is **bounded** with an explicit full-policy; reconnection
  **de-duplicates** (idempotency key) and resumes from the last ack.
- Every external call has a timeout; retry uses bounded exponential back-off.
- Enforced by the **`store-and-forward-validator`** agent — required on any
  gateway / ingest / publisher change.

## 2. Observability — no "silent death" of a headless daemon (MUST)

A background daemon that panics leaves the line running while data quietly stops
reaching the DB. That must be impossible to miss.

- **Structured logging** (Rust `tracing` + a JSON subscriber, or equivalent):
  machine-parseable events, not `println!`. Every error path logs with context.
- A panic in a stream handler must **not** kill the process silently: isolate
  per-message work, log the offending (synthetic-safe) payload, and surface a
  counted, alertable error — never swallow it.
- Expose **liveness/health** (last-sample timestamp, queue depth, drop/error
  counters) so a monitor can detect "edge app stopped" within seconds.
- Run under a **supervised restart policy** (Docker `restart: unless-stopped` /
  systemd) so a crash auto-recovers; pair it with an alert so recovery is visible.
- Enforced by the **`edge-observability-validator`** agent;
  **`silent-failure-hunter`** covers swallowed errors.

## 3. Extreme modularization — keep the AI's context tractable (MUST)

A 4-layer platform in one giant module exhausts both the compiler's incremental
build and an AI assistant's working context months in; the model then forgets
prior spec and emits inconsistent code.

- Split by **responsibility into small, independent units** — separate Rust
  crates / TS packages: e.g. *FH-receive*, *DB-forward*, *AI-handoff*, each with
  a narrow public interface and its own tests.
- Target a unit small enough to read in one pass (≈ a few hundred lines per
  file, one bounded responsibility per crate/package). Layers communicate only
  through defined interfaces (CLAUDE.md §1.2) — never reach into internals.
- Prefer a workspace of small crates over one binary; new device/protocol
  support is a new module, not a fork inside an existing one.

## 4. Safe deploy to a running line (MUST)

Restarting an edge relay mid-production can lose the inspection data in flight.

- Edge components ship as **Docker containers**; updates are restarts, not
  in-place edits.
- The relay must **drain its Store & Forward buffer before exit** (graceful
  shutdown on SIGTERM) so an update never drops buffered samples.
- Define **when** a restart is allowed — a tact-time gap, a detected line-stop /
  break window — as an operational rule decided at infra-design time, not ad hoc.
  Document the chosen window in the deploy runbook.

## 5. Abnormal-case tests are mandatory (MUST)

The edge cases humans miss are exactly what the AI must cover.

- Every edge / gateway change ships tests for the **abnormal path**: network
  drop mid-publish, malformed / unparseable input, buffer-full, restart-mid-flush
  (replay correctness), and reconnect de-duplication.
- Use synthetic fixtures only (no real shop-floor data; CLAUDE.md §2).
- `tdd-guide` + `rust-testing` drive these; an edge MR without abnormal-path
  tests is incomplete.

## 6. Edge / PFE change review sequence (MUST)

0. PFE の設置・伝送・統括管理に関わる場合は
   [`docs/spec/IoT.md/pfe-fleet-management.md`](../../docs/spec/IoT.md/pfe-fleet-management.md)
   をロード — 伝送契約（定常＝プッシュ MQTT+S&F／プル＝R2 レビュー付き例外のみ）、
   宣言駆動オンボーディング（コード変更ゼロ原則）、プロビジョニング P1–P7・
   管理プレーン O1–O6 を定める。PFE の DB を作る／変更する場合は
   `pfe-edge-mcp-toolset` スキルが必須（新規オンボーディングは `pfe-scaffold`）。
1. `edge-mcp-toolset-reviewer` — 標準ツール完備・Flow B 配線・データ局所性・
   中央カタログ同期を審査。
2. `store-and-forward-validator` — ゲートウェイ耐障害性（§1）。
3. ETL を触る場合 `etl-idempotency-checker` — 再実行安全性。
4. 高頻度ストリーム／多デバイス fan-out を触る場合
   `edge-load-saturation-validator` — キュー飽和・バックプレッシャ挙動。
5. 常駐デーモン／ログ／ヘルス／デプロイ配線を触る場合
   `edge-observability-validator` — 構造化ログ・沈黙パニック・停止検知・
   自動再起動（§2・§4）。
