# Tower Defense Game

A 3D tower defense game built with React, Tailwind CSS, and React Three Fiber.

## Features

- **Tile-based tower placement system** - Click tiles on the grid to place towers; invalid path placement shows red tower preview
- **Six tower types**:
  - Basic Tower: Fast firing, single target damage (targets nearest enemy)
  - Slow Tower: Slows enemies on hit with debuff effects
  - AOE Tower: Area of effect damage that hits multiple enemies
  - Laser Tower: Piercing beam that hits multiple enemies in a line (targets furthest enemy)
  - Relay Tower: Support tower that buffs **edge-adjacent** combat towers (+damage and +range; multiple relays stack with diminishing returns). Does not attack; placement preview highlights neighbor tiles that already hold a combat tower
  - Chain Lightning: First hit on the primary target, then the bolt travels and strikes up to three more enemies in order (each hop deals 15% less damage than the previous hit, multiplicative)
- **Four enemy types**:
  - Troop: Standard enemy with balanced stats
  - Fastero: Fast-moving enemy with lower health
  - Tankee: Slow but heavily armored enemy that causes more health loss
  - Medic: Periodically heals nearby allies (not itself); pulse timing respects game pause; a short ring burst plays when the area heal fires
- **Enemy wave system** - 7 waves of increasing difficulty with configurable enemy compositions
- **Level creator** - Dedicated `/editor` route with a mode rail, contextual inspector, and unified publish flow for placing buildings, drawing paths, painting non-buildable water bodies (same schema shape as buildings; stored in `waters` in level JSON), configuring waves, and exporting schema-compatible level JSON files
- **Terrain** - Buildable land tiles use a procedural regolith-style surface (shader speckle / micro-patches on the top face only) plus sparse instanced rock props; path cells and water stay visually distinct; level editor matches the same treatment on land tiles
- **Enemy upgrade system** - After each wave (except before wave 1), pick one of three random upgrades; choices stack for the rest of the level and apply to all spawns. Full-screen blur modal blocks other UI until you choose. The same upgrade can be taken up to three times with stronger effects each tier; at three tiers it is maxed and removed from the pool. Upgrades: Armored (+health), Swift (+speed), Unstoppable (slow immune), Regenerating (HP regen), with tier-scaled gold rewards
- **Economy system** - Earn money by killing enemies, spend it on towers
- **Tower management** - Click on placed towers to view info and sell them (50% refund)
- **Audio system** - Sound effects with adjustable volume controls (master, SFX, music, ambient); gameplay SFX use Web Audio spatialization from world positions and the camera, while UI clicks and screen feedback (pause, win, lose, resume) stay non-spatial
- **Main menu** - Editorial-style start screen with left-rail navigation, large typography, slide-in transitions, and optional GitHub/source icon (`VITE_REPOSITORY_URL` in `.env`)
- **Menu parallax** - In the main menu and in-game pause menu, the tilted panels follow the cursor with a subtle eased rotation and shift, and their canvas-side edge lifts toward the viewer as the pointer nears (receding when it moves away). Off during gameplay and under `prefers-reduced-motion`
- **Level picker** - Play opens a sector list with SVG map previews, wave counts, and one-tap start for each playable level (menu-only `level_main` is not listed)
- **Enemy Almanac** - Bestiary that tracks discovered enemy types with stats and descriptions (persists to localStorage)
- **Wave controls** - Start waves early or wait for automatic wave progression
- **3D graphics** - Built with React Three Fiber for immersive gameplay
- **JSON-based configuration** - Game settings, tower stats, and level data stored in JSON files
- **Explicit loading flow** - Full-screen loading HUD while game and level configs load; `isGameConfigLoaded` and `isLevelConfigLoaded` exposed from core hooks for UI coordination
- **Simulation vs React frame order** - Wave spawning, tower combat, and instanced projectiles read `useGameStore.getState()` inside R3F `useFrame` so gameplay matches Zustand immediately after tab visibility changes (before the next React commit refreshes hook closures)
- **Playwright smoke coverage** - Canvas-aware E2E tests cover menu-to-game flow, first-tower placement, first-wave start, and editor route loading

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The game will be available at `http://localhost:5173`

### Playwright E2E

```bash
npm run test:e2e
```

The Playwright config targets `http://localhost:5173`, reuses an existing local dev server when one is already running, and otherwise starts `npm run dev` automatically. Canvas interactions use a fixed `1280x720` viewport with shared coordinate fixtures from `tests/e2e/fixtures/canvasPoints.ts`.

### Vitest + RTTR Unit Tests

```bash
npm run test:unit
```

Vitest runs React Three Fiber unit tests with `@react-three/test-renderer` without a real browser or WebGL context. Use these tests for focused scene-graph and `useFrame` behavior; keep Playwright for full app, routing, HUD, and canvas interaction flows.

### Build

```bash
npm run build
```

### Performance Stress Test

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

The stress app lives under `src/stress-test/` and is only reachable through its
own Vite entry (`index.stress.html` / `vite.stress.config.ts`). It is **not**
imported by the default `index.html` entry, so `npm run build` never bundles
any stress-test code.

```bash
npm run dev:stress          # serve http://localhost:5174/index.stress.html
npm run build:stress        # build only the stress entry into dist-stress/
npm run test:e2e:stress     # Playwright smoke test + 30s averages (port 5174)
npm run generate:stress-level  # regenerate public/configs/levels/stress.json
```

The stress e2e suite is **not** part of the local `npm run verify` pre-push
gate; instead it runs in GitHub Actions (`.github/workflows/stress-test.yml`)
on every pull request — so it runs before anything is merged — and on pushes
to `master`. The repo is public, so those runs are free. The 30-second average
numbers are printed to the CI test output (`[stress-averages] ...`).

The generated level is written to `public/configs/levels/stress.json` by
`scripts/generate-stress-level.py`; rerun the generator (or commit the result)
when the scenario parameters change.

### Stress-Test Profiling Tooling

All scripts are standalone Node scripts (no test framework) that drive the
stress entry at `http://localhost:5174/index.stress.html` with Playwright.
Start the dev server first (`npm run dev:stress`). Pass `--metal` to force a
real GPU via ANGLE/Metal (`--use-angle=metal`, e.g. an Apple Silicon Mac);
without it Chromium falls back to SwiftShader (software GL), which is a
separate, much slower regime and not representative of the 60 FPS target.

| Script | What it measures |
| --- | --- |
| `scripts/profile-stress.mjs [--metal] [--trace]` | Baseline 30 s averages (FPS, frame, draw calls, triangles, programs) plus 5 steady-state samples; `--trace` captures a Chromium performance trace (CPU + GPU slices) via the CDP `Tracing` domain to `profiling/*.trace` (open in chrome://tracing / Perfetto). |
| `scripts/frame-budget.mjs [--metal]` | Splits frame time into JS longtasks (via `PerformanceObserver`) vs `gl.render` API time vs an **unattributed residual** (non-longtask JS + GPU/present, which it does not measure directly), for the **running** and **paused** simulation. The paused number is an upper bound on GPU cost — if it's near 60 FPS, the GPU has headroom and the rest is CPU/JS. |
| `scripts/cpu-profile.mjs [--metal]` | CDP `Profiler` (2000 samples/s) over a steady-state window; prints top self-time functions. |
| `scripts/attribute-layers.mjs [--metal]` | A/B harness: hides scene layers by name (`skybox`, `ground`, `path`, `grid`, `towers`, `enemies`, `rock-decorations`, `shadow-light`) and measures the FPS delta of each, isolating which part of the scene costs what. |
| `scripts/peak-fps.mjs [--metal] [--minutes N]` | Lets a full run (all 20 waves, restarts) play for N minutes and records the **worst FPS per wave**, so the result reflects the heaviest waves (e.g. wave 19 with ~183 concurrent enemies) rather than just the early ones. |
| `scripts/fps-trend.mjs [--metal] [--seconds N]` | Honest per-frame ground truth: records every rAF interval and samples the live enemy/wave/projectile context, then reports avg / p50 / p90 / p95 / p99 / max frame time and the % of frames below 60/30 FPS with a per-10s time series. This is the script that actually validates "≥60 FPS" (windowed averages like `profile-stress` hide frame hitches). |
| `scripts/cpu-profile.mjs [--metal]` / `scripts/cpu-profile-long.mjs [--metal] [--seconds N]` | CDP `Profiler` (2000 samples/s); `cpu-profile-long` captures a configurable long window so hitches can be correlated with time. |
| `scripts/analyze-cpu.mjs [file]` | Time-resolved analysis of a saved `.cpuprofile`: splits self-time into 1s buckets, separates "hitch" buckets from calm ones, and prints the top self-time functions per bucket plus the overall top list. |
| `scripts/dip-find.mjs [--metal] [--seconds N]` | Correlates JS longtasks and rAF hitches with game context (wave, enemies, projectiles, towers, upgrade gate) to identify the trigger of periodic frame drops. |

The stress app exposes a small debug bridge on `window`
(`__stressScene`, `__stressGl`, `__stressGameStore`, `__stressLevelStore`) and
names its scene layers, which the layer-hiding and GL-instrumentation scripts
rely on.

### Stress-Test Optimizations (CPU/JS-bound → 60 FPS target)

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
  time) is now cached per path-array identity with a `WeakMap`, so the
  4,096-tile grid loop is O(1) per tile after the first build.
- **Precomputed path index.** `src/utils/pathIndex.ts` precomputes segment
  lengths and does an O(log n) binary-search lookup with zero per-call
  allocation, replacing the O(n) scan + segment-array allocation in
  `getPositionAlongPath` that ran per enemy per frame. A
  `WeakMap`-keyed `getPositionAlongMultiplePathsFast` wraps it for the
  multi-path movement path. Covered by `src/utils/pathIndex.test.ts`.
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
geometry & materials** (enemies, rocks, path strips), **precomputed path
lookup**, and **spatially cheap targeting reads** (pooled registry instead of
fresh snapshot arrays). Remaining known costs (for future work): the ~4,200
path-strip box meshes and ~450 star meshes are still individual draw calls —
collapsing them into instanced/merged meshes is the next GPU-side win, and
targeting could additionally be throttled to ~10–20 Hz or use a uniform-grid
spatial hash to avoid O(towers × enemies) scans.

### Live Browser Checks (for AI agents)

Agents can verify the app in a browser using Cursor’s built-in browser MCP (no extra install needed):

1. Assume the dev server is already started
2. Open `http://localhost:5173`
3. Wait for the main menu or game HUD to render
4. Perform smoke checks (e.g. click Play, place a tower, start a wave)

The dev server uses a fixed port (`5173`) and `strictPort: true`, so the URL is always predictable.

## How to Play

1. **Start the game**: Click "Play" on the main menu to enter the game
2. **View the almanac**: Click "Enemy Almanac" to see discovered enemies (undiscovered show as silhouettes)
3. **Select a tower**: Click on a tower in the shop (left side) to select it
4. **Place towers**: Click on a tile in the grid to place the selected tower (cannot place on paths or occupied tiles)
5. **Manage towers**: Click on a placed tower to view its stats and sell it if needed
6. **Start the first wave**: Click "Start next wave" to begin the first wave (gives you time to place towers first)
7. **Defend**: Towers automatically target and shoot at enemies based on their targeting mode
8. **Continue waves**: After each wave is cleared, click "Start next wave" when you're ready to begin the next one
9. **Survive**: Defend against 7 waves of enemies without losing all your health
10. **Win**: Complete all waves to win the game

## Controls

- **Mouse**:
  - Click tiles to place selected towers
  - Click placed towers to select/view info
  - Drag to rotate camera
- **ESC**: Deselect tower or open game menu
- **P**: Pause/Resume game

## Game Mechanics

- **Money**: Start with $10,000, earn more by killing enemies (rewards vary by enemy type)
- **Health**: Start with 20 health, lose health when enemies reach the end (amount varies by enemy type)
- **Waves**: 7 waves with increasing difficulty, each containing multiple enemy types
  - Every wave is started manually: the "Start next wave" button appears before the first wave and after each wave is fully cleared, giving you time to build and adjust before the next wave
- **Tower Types**: Each tower has unique stats:
  - **Basic Tower**: $50, 20 damage, 3.5 range, 1s fire rate
  - **Slow Tower**: $80, 10 damage, 3 range, 0.8s fire rate, slows enemies by 60% for 2s
  - **AOE Tower**: $150, 30 damage, 3 range, 3s fire rate, 1.25 radius area damage
  - **Laser Tower**: $200, 15 damage, 4 range, 2s fire rate, pierces up to 5 enemies
- **Tower Selling**: Sell towers for 50% of their purchase price
- **Targeting**: Towers target either the nearest or furthest enemy based on their type
- **Projectile Types**: Single-target, area-of-effect, and piercing beam projectiles
- **Audio**: Adjustable volume controls for master, SFX, music, and ambient sounds
- **Enemy Almanac**:
  - Accessed from the main menu
  - Undiscovered enemies appear as silhouettes with "???" names
  - Enemies are revealed when you encounter them in battle
  - Discovery progress persists across browser sessions via localStorage
- **Enemy Upgrades** (Risk/Reward System):
  - Between waves (starting from wave 4), you can optionally "empower" the next wave
  - Select upgrades to make enemies stronger in exchange for bonus gold rewards
  - Upgrades unlock progressively:
    - Waves 4-6: Tier 1 upgrades (Armored, Swift), max 1 upgrade
    - Waves 7-10: Tier 1-2 upgrades (adds Unstoppable, Regenerating), max 2 upgrades
    - Waves 11+: All tiers, max 3 upgrades
  - Upgrade effects stack multiplicatively for gold rewards
  - Upgraded enemies display colored rings indicating their active upgrades
  - Slow-immune enemies cannot be slowed by Slow Towers
  - Regenerating enemies heal over time (can be countered with burst damage)

## UI & HUD Architecture

- **UI primitives**: Reusable components under `src/components/ui` (`UIButton`, `UICard`, `UISlider`, `UITypography`, `UIMoney`) provide a consistent design system (variants, sizes, spacing) and are used across all HUD screens for buttons, cards, text, sliders, and money display.
- **HUD layout**: HUD screens use structured wrappers in `src/components/hud`:
  - `HUDWrapper` as the root HUD overlay container on top of the 3D canvas.
  - `HUDOverlay` for centered modal-style overlays (game menu, game over).
  - `HUDSidePanel` for right-side panels (main menu, enemy almanac) with responsive widths and scrollable content.
- **Best practices**: Prefer these primitives and layout components when adding new HUD elements to keep visuals consistent, responsive, and easy to extend.

## Other

Here are documentation links:

- [threejs](https://threejs.org/docs/)
- [react-three-fiber](https://r3f.docs.pmnd.rs/)
- [react-three-drei](https://drei.docs.pmnd.rs/)
