---
name: 3d-graphics-patterns
description: 3D rendering discipline for three.js / react-three-fiber / WebGL2 / WebGPU — frame-budget and allocation rules, draw-call reduction strategy, R3F state/disposal contracts, LOD/culling, picking cost control, worker offloading, GPU memory budgets, and visual testing. Use when: writing or reviewing render loops, 3D viewers (CAD models, factory layouts, sim visualization), or diagnosing low FPS, GC hitches, or growing GPU memory. Do not use when: sim-clock/determinism logic feeding the visuals (simulation-engine-patterns), STEP/CAD import and tessellation (cad-step-processing), shader source files (.wgsl/.glsl/.hlsl — .claude/rules/shader/ auto-attaches), or reviewing finished 3D code (graphics-3d-reviewer agent owns the review).
origin: project
---

# 3D Graphics Rendering Patterns

Rendering code runs 60 times a second. Patterns fine in ordinary app code — allocating
objects, triggering React renders, unbounded scene growth — destroy frame rate here.

## Related (read first)

- `graphics-3d-reviewer` agent — owns review of render loops, scene graphs, shaders, CAD import.
- `.claude/rules/shader/` — shader conventions, auto-attached on `.wgsl`/`.glsl`/`.hlsl` files.
- `cad-step-processing` (tessellation/LOD tiers), `simulation-engine-patterns` (snapshot source).

## Frame Budget

- 16.6 ms total at 60 FPS for app JS + traversal + draw submission + GPU. Rough split:
  app logic ≤ 4 ms, render submission ≤ 4 ms.
- Anything occasionally > 2 ms (loading, parsing, tessellation) never runs on the frame.
- Profile with `renderer.info` (calls, triangles, geometries, textures) and r3f-perf / stats.gl.

## Render-Loop Allocation Rules

- Zero `new` (Vector3/Matrix4/arrays/closures) inside `useFrame`/tick/physics callbacks —
  module-scope scratch objects mutated in place, encapsulated, never leaking out of the loop.
- No per-frame `map`/`filter` chains or object spreads over large arrays.
- Smoothing must be framerate-independent (exponential decay by `delta`, not fixed lerp factor).

## Draw-Call Reduction

Draw calls, not triangles, are the usual CPU bottleneck. Targets: < 100 calls simple
scenes, < 1000 heavy viewers.

| Scene content | Technique |
|---------------|-----------|
| Many copies of one geometry+material (bolts, pallets, repeated machines) | `InstancedMesh` / R3F `<Instances>` |
| Static geometry, one material, no per-part toggling | `mergeGeometries` — one call |
| Different geometries, one material, per-instance edits (CAD assemblies) | `BatchedMesh` |
| Any scene | Share materials — each unique material forces a state change |

## React-Three-Fiber Contracts

- Never put Three objects or per-frame values in React state — refs plus transient zustand
  subscriptions (direct writes to `ref.current`, no re-render).
- `useFrame` priorities: negative runs earlier (input/sim read), positive later (camera rig).
- R3F auto-disposes JSX-declared objects on unmount; anything created imperatively
  (geometry, texture, material) must be disposed in effect cleanup or it leaks GPU memory.
- `useLoader` caches by URL — never wrap in manual caching; evict via `useLoader.clear()`.

## LOD, Culling, Picking

- Merging destroys frustum-culling granularity (one giant bounding sphere) — merge per
  room/zone, preserving spatial locality.
- `THREE.LOD` tiers by distance, generated offline or in a worker; impostor beyond the far
  band. Very large scenes: coarse grid buckets toggling `.visible` per bucket.
- Picking: raycast proxies first, refine on the hit; `mesh.raycast = () => {}` on
  non-pickables; three-mesh-bvh for triangle-accurate picking on big meshes; throttle
  hover picking to ~30 Hz, exact pick on click only.

## Renderer, Threading, Controls

- WebGPU (`WebGPURenderer`, auto WebGL2 fallback) for compute passes, heavy instancing,
  TSL; stay on `WebGLRenderer` for unported ecosystem features or old embedded webviews.
  Feature-detect (`navigator.gpu`), never UA-sniff; test both backends.
- OffscreenCanvas moves the renderer to a worker (forward input manually — no DOM). Even
  without it, parse/tessellate in a worker and transfer `ArrayBuffer`s (zero-copy).
- Use maintained `OrbitControls`/`CameraControls`; always `dispose()` (window listeners),
  damping + `update(delta)` in the loop, clamp distance/polar angles.

## GPU Memory Budget

- Leaks are invisible to JS heap profiles — track `renderer.info.memory`; geometries and
  textures must return to baseline after closing a model.
- Cost: geometry ≈ vertices × attributes × 4 B; texture ≈ w × h × 4 B × 1.33 (mips) — a
  4096² RGBA texture is ~89 MB. Budget for the weakest target (integrated GPU/tablet:
  ≤ 1 GB usable); compress with KTX2/basis; dispose on scene switch.
- Handle `webglcontextlost`/`restored` in production; verify with `forceContextLoss()` in dev.

## Visual Testing

- Canvas pixels are invisible to DOM assertions — Playwright screenshot tests against a
  deterministic frame: fixed camera, animations paused/seeded, damping off,
  `preserveDrawingBuffer`, small diff tolerance, pinned CI GPU (or SwiftShader).
- Math (transforms, LOD selection, culling predicates) is headless unit-testable and falls
  under the repo's 80% coverage rule; screenshots cover the rest.

## Review Checklist

- [ ] No allocation inside frame/tick paths; scratch mutation confined and documented
- [ ] Draw calls bounded via instancing/batching/merging per the table
- [ ] No Three objects in React state; transient subscriptions for fast values
- [ ] Every imperative geometry/material/texture disposed; memory returns to baseline
- [ ] Picking proxied/BVH-accelerated and throttled; heavy parsing off the main thread
- [ ] Deterministic screenshot tests plus headless math unit tests
