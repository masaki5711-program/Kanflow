---
name: iot-edge-resilience-validator
description: Validate that API calls and data persistence survive the unstable networks of a factory floor — exponential-backoff retries, offline store-and-forward queuing (IndexedDB / SQLite), and timeouts on every external call. Use when writing or reviewing network or DB-write code for the Edge or UI layers.
origin: project
---

# IoT Edge Resilience Validator

Factory networks — Wi-Fi and wired LAN alike — drop intermittently due to equipment noise and layout changes. Code must assume the network *will* fail mid-request. Losing in-flight data (production results, OEE events) or crashing on a disconnect is unacceptable for a 24/7 line.

## When To Use

- writing or reviewing API calls, MQTT/HTTP publishing, or DB-write code
- on the Edge layer (Rust / PFE) or the UI layer (browser → server)
- any path that sends production data, sensor readings, or operator input

## Validation Requirements

When generating or reviewing code that performs network I/O or DB writes, confirm all three.

### 1. Retry with exponential backoff

- Transient network errors must trigger a retry, not an immediate failure.
- Use exponential backoff (e.g. 1s, 2s, 4s, 8s …) with a cap and jitter — not a tight retry loop.
- Distinguish retryable errors (timeout, connection reset, 5xx) from non-retryable ones (4xx, validation). Do not retry the latter.

### 2. Local cache / store-and-forward

- When offline, data must be persisted locally and synced once connectivity returns — never dropped.
  - Browser (Layer 4): IndexedDB (or a wrapper) for the outbound queue.
  - Edge (Layer 1/2, Rust): a local store — the PFE PostgreSQL, or SQLite — as the durable buffer.
- The sync on reconnect must be asynchronous and **idempotent** — replaying a queued item twice must not double-count production.
- Give each queued record a client-generated id / timestamp so the server can deduplicate.

### 3. Timeouts on every external call

- Every network, PLC, file, and DB call must have an explicit timeout (typically 5–10s) so a frozen peer cannot hang the device.
- A timeout must surface as a retryable error, feeding back into requirement 1.

## Execution Instructions

When reviewing or generating such code, report:

1. **Retry**: is exponential backoff present, with retryable / non-retryable error classification?
2. **Offline durability**: is there a store-and-forward queue, and is replay idempotent?
3. **Timeouts**: does every external call have an explicit, reasonable timeout?

For each gap, output corrected, copy-paste-ready code.

## Notes

- CLAUDE.md already mandates timeouts and retries on all I/O boundaries for the Rust Edge layer — this skill extends the same guarantee to the UI layer and verifies it concretely.
- Idempotency is the subtle failure: a resilient client that is not idempotent silently inflates production counts after every reconnect.
