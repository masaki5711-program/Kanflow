---
name: simulation-engine-patterns
description: Simulation engine architecture — discrete-event vs fixed-timestep selection, deterministic seeded RNG and replay, headless sim-core/UI separation, snapshot contracts, hot-loop performance, speed control, and correctness validation (conservation checks, Little's law). Use when: building or reviewing production simulators, physics loops, discrete-event models, or any game-loop/sim-clock code, and when debugging non-reproducible runs. Do not use when: rendering the sim's visuals (3d-graphics-patterns), consuming live device streams rather than simulated ones (hardware-data-stream-handler), or reviewing finished sim code (simulation-reviewer agent owns the review).
origin: project
---

# Simulation Engine Patterns

A simulation engine is a deterministic state machine advanced by a clock that is not
wall-clock time. Almost every sim bug violates one of three separations: sim time vs render
time, sim state vs UI state, or deterministic logic vs ambient randomness.

## Related (read first)

- `simulation-reviewer` agent — owns review of sim cores, event queues, integrators;
  mandatory when determinism/reproducibility matters.
- `3d-graphics-patterns` — rendering side (interpolated reads from snapshots).
- `hardware-data-stream-handler` — general high-frequency stream rules the UI bridge inherits.

## Architecture Selection

| System character | Architecture |
|------------------|--------------|
| State changes at irregular instants (job arrives, machine finishes) | Discrete-event: event calendar (min-heap by time), clock jumps between events |
| Continuous physics-style integration | Fixed timestep with accumulator; render interpolates between states |
| Mixed (line sim + moving parts) | DES core; fixed-step integrator scheduled as recurring events |

## Discrete-Event Rules

- Sim-clock owned by the engine; handlers never read `Date.now`/`performance.now`.
- Simultaneous events break ties deterministically via a monotonic sequence counter —
  an unordered tie is a heisenbug generator.
- Negative delays rejected at `schedule()`; calendar never holds an event in the past;
  cancellation by lazy deletion (cancelled flag checked on pop), not heap removal.

## Fixed-Timestep Rules

- Integrate at one fixed `dt` always — variable `dt` makes behavior framerate-dependent.
  Accumulator pattern: 0..N fixed steps per rendered frame; wall delta scaled by the
  speed factor before accumulating.
- Spiral-of-death guard: clamp the accumulator; log every clamp trigger — silently
  dropping sim time violates the no-silent-failure rule (CLAUDE.md §2.5).
- Keep previous + current state; render `lerp(prev, curr, alpha)` for smooth visuals.

## Determinism Contract

- Same seed + same inputs ⇒ bit-identical run. Forbidden inside the sim core:
  `Math.random`, `Date.now`, `performance.now`, `crypto.getRandomValues` (fine in UI/id code).
- Seeded PRNG (e.g. mulberry32), one stream per subsystem derived from the master seed —
  otherwise an extra draw in one subsystem reorders every other subsystem's draws.
- Floating point: deterministic per build/platform, but transcendental fns and FMA/SIMD
  differ across engines/architectures. Cross-platform lockstep needs fixed-point or
  polyfilled math; single-platform replay just needs a pinned runtime.
- Replay = seed + external-input log (user commands, injected disruptions, with sim-times).
  Re-running reproduces everything else — cheapest save format and best bug report.

## Headless Core and Snapshots

- Sim core is a pure module: no DOM, no renderer imports; commands enter through one
  `sim.apply(command)` boundary; UI reads projections/snapshots, never mutable internals.
  This is what makes the repo's 80% coverage target achievable on sim logic.
- Snapshot = plain serializable data supporting `snapshot()`/`restore()`. Must include:
  sim-clock, all RNG stream states, event calendar, sequence counter (forgetting RNG state
  is the classic restore-then-diverge bug). Snapshots enable save/load, time-travel
  debugging (periodic snapshot + event log between), and branching what-if runs.

## Hot Loop and Speed Control

- No allocation in `step()`/`update()`: object pools for events/entities, preallocated
  typed arrays, reused scratch objects. Prefer struct-of-arrays past ~10⁴ entities.
  Controlled in-place mutation here is the sanctioned escape hatch — encapsulated,
  immutable-looking public API (snapshots out, commands in).
- Speed is a wall-to-sim time ratio only — never change `dt` or event logic. Pause =
  factor 0. Fast-forward runs the calendar as fast as CPU allows but yields periodically
  (e.g. every ~10k events) so the UI breathes and cancel works, and emits progress.
- UI bridge: batch events into a bounded buffer, flush at ~10 Hz as one state update;
  count and surface drops — never hide them. Run the core in a worker (or Rust/Tauri
  backend) posting aggregated snapshots/KPI deltas, not raw event streams.

## Correctness Validation

- Conservation assertions (debug builds + tests): parts in = out + WIP + scrapped; no
  entity in two stations; clock monotonic. Violations throw immediately.
- At least one analytic-model test (e.g. M/M/1 queue length within a tolerance band,
  warm-up discarded) — assert against theory, not "it runs". Little's law (`L = λ·W`) is
  the universal, distribution-independent smoke test for any queue/buffer/line —
  a violation means the stats collection or the sim itself is wrong.
- Same-seed replay test: two runs, identical final state hash.

## Review Checklist

- [ ] No wall-clock or ambient randomness in the sim core; per-subsystem seeded RNG
- [ ] Deterministic event tie-break; accumulator clamp logs when it fires
- [ ] Core runs headless with 80% coverage; single command/snapshot boundary to UI
- [ ] Snapshots carry clock + RNG states + calendar + seq; restore matches uninterrupted run
- [ ] Hot loop allocation-free; speed control scales ratio only; fast-forward yields + reports
- [ ] UI updates batched with bounded buffers and surfaced drops
- [ ] Conservation assertions, one analytic test, and a same-seed replay test present
