---
name: cad-step-processing
description: CAD geometry and STEP (ISO 10303) file processing — AP203/AP214/AP242, OpenCascade import paths (occt-import-js, pythonocc, cascadio, Rust options), B-rep vs mesh, tessellation and LOD tiers, unit inference, coordinate-system conversion to three.js, tolerances and healing, assembly hierarchy, large-model streaming, and geometry validation. Use when importing, converting, tessellating, or validating STEP/CAD files, or building a CAD viewer/processor.
origin: project
---

# CAD Geometry & STEP Processing

STEP files are exact B-rep solids with declared units, deep assembly trees, and vendor-specific quirks. Treating them like mesh files (assume mm, assume Y-up, tessellate once) produces silently wrong geometry. This skill covers correct import, tessellation, and validation.

## When to Use

- Importing or exporting STEP (`.stp`/`.step`) or other B-rep CAD data
- Building a web/desktop CAD viewer (three.js, Tauri, native)
- Tessellating B-rep to meshes, generating LODs, or validating imported geometry
- Debugging wrong scale, mirrored/rotated models, missing faces, or broken assemblies

## STEP Basics: Application Protocols

| AP | Scope | Expect to see |
|----|-------|----------------|
| AP203 | Geometry + config management (aero heritage) | Pure shapes, little metadata |
| AP214 | AP203 + colors, layers, GD&T basics (automotive) | Most files in the wild |
| AP242 | Successor to both: PMI, tessellated geometry, kinematics | Modern PLM exports |

The header names the protocol: `FILE_SCHEMA(('AUTOMOTIVE_DESIGN' ...))` = AP214, `AP242_MANAGED_MODEL_BASED_3D_ENGINEERING` = AP242. Parse geometry identically; only metadata richness differs. Never reject a file on schema string alone — importers read all three.

## Import Paths

| Environment | Library | Notes |
|-------------|---------|-------|
| C++ | OpenCascade (OCCT) `STEPControl_Reader` / `STEPCAFControl_Reader` | Reference implementation; CAF variant reads assembly/color/name data |
| Browser / Node | `occt-import-js` (OCCT via WASM) | Returns tessellated meshes + hierarchy JSON; run in a worker |
| Python | `pythonocc-core` (full OCCT bindings) or `cascadio` (STEP → GLB, used by trimesh) | pythonocc for geometry ops; cascadio for pure conversion pipelines |
| Rust | `opencascade-rs` (OCCT bindings) or `truck` (pure-Rust B-rep kernel) | truck avoids the C++ dependency but has narrower STEP coverage |

Use the CAF (XDE) readers when you need names, colors, and the assembly tree — the plain reader flattens everything into one shape.

```python
# pythonocc: read + tessellate
from OCC.Core.STEPControl import STEPControl_Reader
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh

reader = STEPControl_Reader()
if reader.ReadFile("part.step") != IFSelect_RetDone:
    raise ValueError("STEP parse failed")          # fail loud, never continue
reader.TransferRoots()
shape = reader.OneShape()
BRepMesh_IncrementalMesh(shape, 0.1, False, 0.5, True)  # lin defl, ang defl (rad)
```

## B-rep vs Mesh — Keep Both, Know Which You Hold

- **B-rep** (boundary representation): exact analytic surfaces (planes, cylinders, NURBS) bounded by topological faces/edges. Supports exact measurement, offsetting, booleans, re-tessellation at any quality.
- **Mesh**: triangles approximating the B-rep at one chosen quality. Cheap to render; measurements are approximate; you cannot recover the B-rep.

Rule: keep the B-rep (or its file) as the source of truth; treat meshes as disposable render artifacts regenerated on demand. Never measure clearances or volumes on the render mesh.

## Tessellation: Deflection Tradeoffs and LOD Tiers

Two knobs control quality:

- **Linear deflection**: max chord distance (model units) between triangle and true surface. Smaller = more triangles.
- **Angular deflection**: max angle between adjacent facet normals — governs curvature sampling on small-radius features.

Set linear deflection *relative* to model size, or small parts get absurd triangle counts and large parts get faceted:

```typescript
const diag = bboxDiagonal(shape);
const tiers = [
  { name: "high", linear: diag * 0.0005, angular: 0.2 },  // inspection view
  { name: "mid",  linear: diag * 0.002,  angular: 0.4 },  // default view
  { name: "low",  linear: diag * 0.01,   angular: 0.8 },  // overview / far LOD
];
// One B-rep → three meshes → THREE.LOD levels (see 3d-graphics-patterns skill)
```

Tessellate each tier from the *B-rep*, never by decimating the high mesh — decimation destroys sharp feature edges that re-tessellation preserves.

## Units: Never Assume Millimeters

STEP files declare their length unit (`SI_UNIT(.MILLI.,.METRE.)`, inches via `CONVERSION_BASED_UNIT`). Exporters disagree: SolidWorks commonly emits mm, some aero tools emit inches or metres. A "1000× too big" or "25.4× off" model is always a unit bug.

- Read the unit from the file (OCCT: applied automatically when using the standard readers — resulting geometry is in mm by default via `xstep.cascade.unit`; set it explicitly rather than trusting defaults).
- Normalize to ONE internal unit at the import boundary (recommend metres for three.js scenes, mm for manufacturing math — pick one, document it, convert once).
- Validate: after import, sanity-check the bounding box against expected magnitude (a car door that is 1.2 units in a metres-world is right; 1200 means mm leaked through). Surface the inferred unit to the user instead of silently guessing.

## Coordinate Systems: Z-up CAD → Y-up three.js

CAD kernels are right-handed and conventionally **Z-up**; three.js is right-handed **Y-up**. Convert with a rotation, never by swapping axes in the vertex buffer by hand (sign errors mirror the model — a mirrored part is the classic symptom).

```typescript
// -90° about X maps Z-up → Y-up, preserving handedness
modelRoot.rotation.x = -Math.PI / 2;
// or bake into a root matrix so children stay untouched:
modelRoot.matrix.makeRotationX(-Math.PI / 2);
modelRoot.matrixAutoUpdate = false;
```

Apply the conversion exactly once, at one root node. If normals look inverted or text is mirrored, handedness was broken — check for a negative-determinant transform (`matrix.determinant() < 0`).

## Tolerances and Healing

Two distinct concepts — do not conflate:

- **Modeling tolerance**: the kernel's gap allowance for calling entities "connected" (OCCT default ~1e-7 m per shape, stored per face/edge). Files from other kernels arrive with gaps larger than your tolerance → "open" shells.
- **Geometric tolerance (GD&T/PMI)**: design intent annotations (flatness, position). Metadata, not geometry — carry it through, never "apply" it to coordinates.

Healing imported geometry (in order, only as needed):

```python
from OCC.Core.ShapeFix import ShapeFix_Shape
from OCC.Extend.TopologyUtils import TopologyExplorer

fix = ShapeFix_Shape(shape)
fix.SetPrecision(1e-4)        # healing tolerance in model units — tighter than feature size!
fix.Perform()
healed = fix.Shape()
```

Sewing (`BRepBuilderAPI_Sewing`) stitches independent faces into shells. Rules: heal with the loosest tolerance that closes the gaps — an over-loose tolerance welds distinct features together; log every healing action (repo rule: no silent fixes); if healing changes volume by more than ~0.1%, flag it for the user.

## Assembly Structure

STEP assemblies are a product tree: `NEXT_ASSEMBLY_USAGE_OCCURRENCE` links parent → child with a placement transform. The same product may be *instanced* many times (one wheel definition, four placements).

- Read via XDE (`STEPCAFControl_Reader` + `XCAFDoc_ShapeTool`) to get the tree with names, transforms, and colors.
- Preserve instancing: tessellate each unique product once, render N placements — map directly to `InstancedMesh`/`BatchedMesh` (see `3d-graphics-patterns`). Flattening 500 bolt instances into 500 meshes wastes memory and draw calls.
- Keep the source path (`assembly/subassembly/part`, plus occurrence id) on every node — selection, BOM, and metadata lookups depend on stable ids, not display names (names collide).

## Large-Model Strategy

A production-line STEP file can be multi-GB with 10⁵ parts. Never parse it on the UI thread and never tessellate everything up front.

- **Workers**: parse + tessellate in a worker (or Rust/Tauri backend process); post transferable `ArrayBuffer`s of vertex data, not JSON.
- **Progressive loading**: import the assembly tree first (fast), show bounding boxes, then tessellate parts by priority (visible / near camera first). Stream results part-by-part.
- **Per-part LOD + eviction**: keep low-tier meshes resident; load high tiers on demand and evict by LRU against a GPU memory budget.
- **Cache tessellations** keyed by content hash of (part geometry, deflection params) so re-opening a model is instant (see `content-hash-cache-pattern` skill).

## Validation of Imported Geometry

Validate at the boundary — imported CAD is external input:

- **Parse status**: reader return codes checked; count of transferred vs. total roots reported.
- **Watertightness**: closed solids should have shells where every edge borders exactly 2 faces. OCCT: `BRepCheck_Analyzer(shape).IsValid()`; count free edges via `ShapeAnalysis_FreeBounds`.
- **Degenerate faces**: zero-area faces and sliver triangles (post-tessellation: reject triangles with area < ε or aspect ratio > ~10³) — they break picking and normals.
- **Sanity metrics**: bounding box magnitude (unit check), volume > 0 with correct orientation (negative volume = inverted shell), part count vs. tree count.
- Report a structured import summary (per-part: healed?, open edges, volume) instead of silently rendering whatever survived.

## Round-Trip Caveats

- STEP → mesh (glTF/OBJ) → STEP is **lossy and irreversible**: B-rep, exact surfaces, PMI, and assembly semantics are gone. Never present a re-exported mesh as CAD data.
- Even STEP → STEP through a different kernel re-approximates NURBS and re-tolerances edges; expect small volume drift and changed entity ids. Persistent ids must be your own, not STEP entity numbers (`#123` line ids are not stable across exports).
- Colors/names survive AP214/AP242 XDE round-trips; layer and PMI fidelity varies by exporter — test with the customer's actual CAD system output, not just your own samples.

## Review Checklist

- [ ] Reader return codes checked; import failures surface as errors, never empty scenes
- [ ] Units read from the file, normalized once at the boundary, sanity-checked via bbox
- [ ] Z-up → Y-up applied once at a root node; no negative-determinant transforms
- [ ] Tessellation deflection scaled to model size; LOD tiers generated from B-rep, not decimation
- [ ] Healing tolerance justified and every heal logged; volume drift flagged
- [ ] Assembly instancing preserved end-to-end (one geometry, N transforms)
- [ ] Parsing/tessellation off the UI thread; large models load progressively
- [ ] Watertightness/degeneracy validation runs on every import with a visible report
