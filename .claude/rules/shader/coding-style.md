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
# Shader Coding Style

- **Naming**: uniforms `u` prefix or uniform block; varyings `v` prefix;
  attributes `a` prefix; constants `UPPER_SNAKE_CASE` declared `const`
  (WGSL/GLSL) / `static const` (HLSL)
- **GLSL ES precision**: declare explicitly — a default `precision` directive
  per fragment shader plus per-variable qualifiers where they deviate; never
  rely on implicit precision (differs across drivers)
- **Document the math (MANDATORY)**: every varying and uniform states its
  coordinate space and units in a comment — mixed spaces are the #1 shader
  bug and invisible in the code; cite the source of any formula and the
  meaning of each magic-looking term
- **Constants over magic numbers**: name thresholds, epsilons, and physical
  constants; bare literals only in obvious lerp/clamp contexts
- **Branching**: no dynamic (non-uniform) branching in hot fragment/compute
  paths — use branchless forms (mix/lerp, step, clamp), a uniform branch, or
  a shader variant; uniform-value branches are cheap; early-out (discard /
  return) before expensive fetches or loops when the condition is coherent
  across neighboring fragments
- **Built-ins over hand-rolled math**: mix, clamp, smoothstep, dot, normalize,
  reflect, inversesqrt, saturate map to hardware instructions; write
  fma-friendly forms (`a * b + c`)
- **Structure**: small focused shaders; shared helpers in include files, not
  copy-pasted; one descriptively-named entry point per file
