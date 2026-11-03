---
paths:
  - "**/*.wgsl"
  - "**/*.glsl"
  - "**/*.hlsl"
  - "**/*.vert"
  - "**/*.frag"
  - "**/*.comp"
  - "**/*.cginc"
  - "**/*.shader"
---
# Shader Performance

Fragment code runs per-pixel per-frame — every instruction is ×millions.

- **Move work up the pipeline**: constant-per-draw values → CPU, uploaded as
  uniforms; linearly-interpolating values → vertex stage, passed as varyings;
  never recompute either per fragment
- **Minimize varyings**: pass only what the fragment stage needs; pack
  related scalars into vec4s; never pass unused varyings or values cheaper to
  derive in-fragment than to interpolate
- **Texture fetch discipline**: cache-coherent UVs (neighboring fragments
  fetch neighboring texels); avoid dependent texture reads — precompute
  lookup coordinates in the vertex stage or bake the indirection into one
  texture; batch fetches early so latency overlaps ALU work
- **Precision (GLSL ES / mobile)**: `mediump` (or `lowp` for 0–1
  colors/normals) wherever range allows — half precision doubles ALU
  throughput; keep `highp` for positions, depth, large UV ranges, and
  accumulated time (a `mediump` time uniform jitters after minutes)
- **Compute workgroups (WGSL)**: size a multiple of the wave size — 64 is the
  portable default; heavy shared-memory or register use lowers occupancy, so
  smaller groups can win; match group shape to the memory access pattern
- **Overdraw**: render opaque front-to-back for early-Z; avoid `discard` /
  depth writes that disable early depth testing on large opaque surfaces;
  minimize layered alpha-blended full-screen quads (prefer alpha cutout with
  early discard); collapse trivial post-process chains when bandwidth-bound
