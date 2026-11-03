---
name: hardware-data-stream-handler
description: Generate and verify code that handles high-frequency data streams from equipment (MQTT, WebSocket, OPC UA, serial) without memory leaks or blocking the main thread — render throttling/batching, subscription and listener cleanup, and offloading heavy work to background threads. Use when consuming PLC or sensor streams.
origin: project
---

# Hardware Data Stream Handler

PLCs and sensors emit high-frequency data — cycle time, temperature, vibration — continuously. Naive handling leaks memory and crashes the app or the browser. This skill keeps streaming code stable for 24/7 operation.

## When To Use

- consuming a real-time stream: MQTT, WebSocket, OPC UA subscription, or serial
- on the Edge layer (Rust / PFE) or the UI layer (browser receiving live data)
- any component that subscribes to equipment data

## Requirements

### 1. Decimation / batching

- When data arrives tens of times per second, do not update the DOM (or re-render) on every message.
- Throttle / debounce screen updates to a human-perceivable rate (e.g. 4–10 Hz).
- Batch writes: accumulate N records (or a time window) and write to the DB in one operation, not one row per message.

### 2. Memory release (cleanup)

- When a component is destroyed (navigation away, unmount), it MUST disconnect the WebSocket/subscription and remove every event listener.
  - React (Layer 4): return a cleanup function from `useEffect`; cancel in-flight work with `AbortController`.
  - Rust (Layer 1/2): ensure tasks and subscriptions are dropped/cancelled on shutdown — this ties into the mandated graceful-shutdown handling.
- Bound every in-memory buffer. An array that grows with each message is a guaranteed leak.

### 3. Off-thread heavy work

- Parsing and heavy computation (e.g. comparing theoretical vs. actual values, OEE math) must not run on the main thread.
- Browser: move it to a Web Worker.
- Edge: run it on a separate task / background process, off the I/O path.

## Execution Instructions

When generating or reviewing streaming code, report:

1. **Render / write load** — is update frequency throttled, and are DB writes batched?
2. **Cleanup** — is every subscription and listener released on teardown, and is every buffer bounded?
3. **Threading** — is heavy parsing / computation off the main thread?

For each gap, output corrected, copy-paste-ready code.

## Notes

- The most common factory-app crash is an unbounded buffer plus a missing cleanup — always review both together.
- This pairs with `iot-edge-resilience-validator` (the network side) and `db-query-performance-optimizer` (the batched-write side).
