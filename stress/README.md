# Performance Stress Test

A dedicated, unattended stress-test entry saturates the renderer and simulation
on a generated `64x64` level: 4096 shader-compiled grid tiles, a 64-waypoint
serpentine path (~2,080 strip segments, each a pair of box meshes), 150
pre-placed towers of all six types, and 20 waves totalling ~2,330 enemies. The
run loops forever with a very high base health so it never ends, and a live
overlay shows FPS, frame time, draw calls, triangles, JS heap, and wave/entity
counts. After 30 seconds of steady rendering it freezes a **30-second average**
block (FPS, frame, draw calls, triangles, programs) for baseline measurement —
no thresholds are enforced yet, the numbers are reported so limits can be set
later.

Everything stress-test related — the app, the entry HTML, the Vite and
Playwright configs, the e2e spec, and the profiling scripts — lives under
`stress/` (the level data stays at `public/configs/levels/stress.json` because
it is fetched at runtime). The stress app is only reachable through its own
Vite entry (`stress/index.stress.html` / `stress/vite.config.ts`) and is
**not** imported by the default `index.html` entry, so `npm run build` never
bundles any stress-test code.

```bash
npm run dev:stress          # serve http://localhost:5174/stress/index.stress.html
npm run build:stress        # build only the stress entry into stress/dist/
npm run test:e2e:stress     # Playwright smoke test + 30s averages (port 5174)
npm run generate:stress-level  # regenerate public/configs/levels/stress.json
```

The stress e2e suite is **not** part of the local `npm run verify` pre-push
gate and is **not** run in CI; it is a local profiling tool. The 30-second
average numbers are printed to the test output (`[stress-averages] ...`).

The generated level is written to `public/configs/levels/stress.json` by
`scripts/generate-stress-level.py`; rerun the generator (or commit the result)
when the scenario parameters change.

## Profiling Tooling

All scripts are standalone Node scripts (no test framework) that drive the
stress entry at `http://localhost:5174/stress/index.stress.html` with
Playwright. They are **self-contained**: each starts the stress dev server
itself (from the repo root, via `stress/stress-server.mjs`) if nothing is
already listening on port 5174, and stops it again on exit; a manually
started `npm run dev:stress` is simply reused. The page is the stress scene
itself — the main menu and its usual flow are never loaded. Run them from the
repo root (e.g. `node stress/scripts/fps-trend.mjs --metal`); artifacts land
in `profiling/` at the repo root. Pass `--metal` to force a real GPU via
ANGLE/Metal (`--use-angle=metal`, e.g. an Apple Silicon Mac); without it
Chromium falls back to SwiftShader (software GL), which is a separate, much
slower regime and not representative of the 60 FPS target.

| Script | What it measures |
| --- | --- |
| `stress/scripts/profile-stress.mjs [--metal] [--trace]` | Baseline 30 s averages (FPS, frame, draw calls, triangles, programs) plus 5 steady-state samples; `--trace` captures a Chromium performance trace (CPU + GPU slices) via the CDP `Tracing` domain to `profiling/*.trace` (open in chrome://tracing / Perfetto). |
| `stress/scripts/frame-budget.mjs [--metal]` | Splits frame time into JS longtasks (via `PerformanceObserver`) vs `gl.render` API time vs an **unattributed residual** (non-longtask JS + GPU/present, which it does not measure directly), for the **running** and **paused** simulation. The paused number is an upper bound on GPU cost — if it's near 60 FPS, the GPU has headroom and the rest is CPU/JS. |
| `stress/scripts/cpu-profile.mjs [--metal]` | CDP `Profiler` (2000 samples/s) over a steady-state window; prints top self-time functions. |
| `stress/scripts/attribute-layers.mjs [--metal]` | A/B harness: hides scene layers by name (`skybox`, `ground`, `path`, `grid`, `towers`, `enemies`, `rock-decorations`, `shadow-light`) and measures the FPS delta of each, isolating which part of the scene costs what. |
| `stress/scripts/peak-fps.mjs [--metal] [--minutes N]` | Lets a full run (all 20 waves, restarts) play for N minutes and records the **worst FPS per wave**, so the result reflects the heaviest waves (e.g. wave 19 with ~183 concurrent enemies) rather than just the early ones. |
| `stress/scripts/fps-trend.mjs [--metal] [--seconds N]` | Honest per-frame ground truth: records every rAF interval and samples the live enemy/wave/projectile context, then reports avg / p50 / p90 / p95 / p99 / max frame time and the % of frames below 60/30 FPS with a per-10s time series. This is the script that actually validates "≥60 FPS" (windowed averages like `profile-stress` hide frame hitches). |
| `stress/scripts/culling-probe.mjs [--metal]` | Counts the culled entity roots (towers/enemies, marked `userData.culledEntity`; an unmarked control build falls back to mesh-owning groups) that are `visible` vs hidden in the live scene over ~20 s of steady state, alongside live FPS/frame/draw. Run with and without frustum culling wired for an honest A/B: in the clean build every root stays visible (100%) by definition, so the delta is the culled fraction. Exits nonzero if it never reaches steady state or the samples are invalid, so a failed run cannot masquerade as a clean result. |
| `stress/scripts/cpu-profile.mjs [--metal]` / `stress/scripts/cpu-profile-long.mjs [--metal] [--seconds N]` | CDP `Profiler` (2000 samples/s); `cpu-profile-long` captures a configurable long window so hitches can be correlated with time. |
| `stress/scripts/analyze-cpu.mjs [file]` | Time-resolved analysis of a saved `.cpuprofile`: splits self-time into 1s buckets, separates "hitch" buckets from calm ones, and prints the top self-time functions per bucket plus the overall top list. |
| `stress/scripts/dip-find.mjs [--metal] [--seconds N]` | Correlates JS longtasks and rAF hitches with game context (wave, enemies, projectiles, towers, upgrade gate) to identify the trigger of periodic frame drops. |
| `stress/scripts/moving-camera.mjs [--metal]` | A/B for the "moving the camera with the mouse" case: an IDLE phase (static camera) then a MOVE phase (continuous mouse drag + WASD), reporting FPS/frame/draw/tri per phase plus the live culled-group fraction (marked entity roots; an unmarked control build falls back to mesh-owning groups). The static benchmarks never move the camera, so they are blind to per-frame work that only runs during motion. Exits nonzero if steady state is never reached or a phase samples invalid data. |
| `stress/scripts/cpu-profile-moving.mjs [--metal]` | CDP `Profiler` (2000 samples/s) over a ~12 s window of continuous camera motion (same input pattern as `moving-camera.mjs`), so the top self-time functions reflect the moving-camera cost; writes `profiling/cpu-profile-moving-*.cpuprofile`. Exits nonzero if the scene never reaches steady state before the profile is taken. |

The stress app exposes a small debug bridge on `window`
(`__stressScene`, `__stressGl`, `__stressGameStore`, `__stressLevelStore`) and
names its scene layers, which the layer-hiding and GL-instrumentation scripts
rely on.

## Optimizations (CPU/JS-bound → 60 FPS target)

Profiling on an Apple M1 Pro (`--metal`) showed the stress scene is
**CPU/JS-bound, not GPU-bound**: the same ~2,180-draw-call scene renders at
~75 FPS with the simulation paused, while running it cost ~87 ms of JS per
frame (≈4 FPS). The optimizations below cut the steady-state JS from
~87 ms/frame to under 1 ms/frame, bringing the stress test to a stable
~68 FPS on M1 Pro (the 60 FPS target is met with headroom; p50 ≈75 FPS,
p90 ≈68 FPS, and only ~6% of frames dip below 60 FPS).

- **Killed the re-render storms.** The biggest single win: the stress entry
  passed an **inline `placeTower={() => {}}` lambda** to `GameScene`, which
  re-created the function on every enemy kill/spawn (the parent subscribes to
  `money`/`activeEffects`). Since `Grid` is `memo` on `placeTower`, every kill
  re-rendered **all 4,096 tile meshes** (this was the dominant `diffProps` /
  `commitUpdate` spike in the profiles). It is now a stable `useCallback`
  no-op. Tower fire-time (`lastFireTime`) also no longer lives in the reactive
  `towers` zustand array (it was updated on every shot, re-creating the array
  and re-rendering the grid, decorations, and tower system). It now lives in a
  ref inside `TowerSystem` and is pruned on place/sell/restart. `Grid` and
  `PlanetTileDecorations` no longer subscribe to per-frame-mutated state
  (towers/money/active effects); they subscribe only to static level data
  (path, water, grid geometry), so a tower shot or enemy kill no longer
  re-renders 4,096 tiles.
- **Cached the on-path lookup.** `isGridTileOnPath` (was ~15% of total CPU
  time) is now cached per path-array identity with a `WeakMap` (via the
  `src/utils/withCache.ts` helper), so the 4,096-tile grid loop is O(1) per
  tile after the first build.
- **Pooled enemy snapshots.** `refreshEnemyRegistry` keeps one `Enemy` object
  per live entity (object pooling) and refreshes its dynamic fields in place
  each frame, instead of allocating a fresh `Enemy` per entity per frame.
  Tower targeting, projectile homing, and the living-enemy reads all use the
  pooled list. `getLivingEnemyCount` counts the hot trait fields directly for
  the wave-system "is the field clear?" checks (up to 3× per frame) without
  building snapshot objects.
- **Imperative health bar.** `Enemy.tsx` no longer re-renders via
  `useTrait(EnemyState)` on every health change (which at peak waves meant
  ~183 React re-renders + new box geometries per frame). It reads the cold
  state once at mount and updates the health bar imperatively in `useFrame`
  (scaling a shared unit box + swapping a shared tier material). Enemy bodies
  and health bars now share one sphere/box geometry and cached materials
  instead of a unique geometry/material per enemy per render.
- **Lazy / reduced per-frame allocations.** Projectile hit only builds the
  full snapshot array for AOE (the common single/beam/chain hits don't), and
  the per-frame `getEnemiesById` Map + per-enemy snapshot in the instanced
  projectile system is replaced by the pooled registry.

These are the classic game-dev mechanics applied here: **object pooling**
(projectiles were already pooled; now enemies too), **instancing / shared
geometry & materials** (enemies, rocks, path strips), and **spatially cheap
targeting reads** (pooled registry instead of fresh snapshot arrays).
Remaining known costs (for future work): the ~4,200 path-strip box meshes and
~450 star meshes are still individual draw calls — collapsing them into
instanced/merged meshes is the next GPU-side win, and targeting could
additionally be throttled to ~10–20 Hz or use a uniform-grid spatial hash to
avoid O(towers × enemies) scans.
