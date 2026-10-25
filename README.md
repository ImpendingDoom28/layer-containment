# Tower Defense Game

A 3D tower defense game built with React, Tailwind CSS, and React Three Fiber.

## Features

- **Tile-based tower placement system** - Click tiles on the grid to place towers; invalid path placement shows red tower preview. While a tower is selected, the hovered tile also shows a range ring (green on buildable tiles, red on blocked ones) so you can judge reach before placing
- **Combat juice** - Gold rewards (`+$N`) float up on each kill, enemies flash white when hit (a transparent per-enemy overlay so same-colored units don't light up together), and a small dual-ring bu rst plays when an enemy dies. Rendered via a pooled camera-facing sprite system and a capped burst list so it stays cheap at peak enemy counts
- **ECS-backed visual effects** - The spawn and end-of-path ring bursts are koota ECS entities (an `IsEffect` tag, an `Effect` data trait, and the generic `Position` trait). Callers raise a short-lived `spawnEffectRequest` via `effectActions.requestSpawnEffect`; an apply system turns each request into an effect entity, and `EffectSystem` renders the active effects via a `useQuery` subscription. Each entity is destroyed the moment its animation finishes, so the world — not a store array — is the single source of truth for active effects
- **Denied-action feedback** - Trying to place a tower that can't be placed (unaffordable, or on a blocked tile — occupied by a tower/building, on the path, or water) shakes the camera and the tower shop row and plays a short noise cue; the shop row also shakes when a tower card is tapped while unaffordable. Camera and HUD shake are skipped under `prefers-reduced-motion`
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
- **Enemy upgrade system** - After each wave (except before wave 1), pick one of three random upgrades; choices stack for the rest of the level and apply to all spawns. Full-screen blur modal blocks other UI until you choose. The same upgrade can be taken up to three times with stronger effects each tier; at three tiers it is maxed and removed from the pool. Upgrades: Armored (+health), Swift (+speed), Unstoppable (slow resistance per tier, full slow immunity at tier 3), Regenerating (HP regen), with tier-scaled gold rewards
- **Economy system** - Earn money by killing enemies, spend it on towers
- **Tower management** - Click on placed towers to view info and sell them (50% refund)
- **Audio system** - Sound effects with adjustable volume controls (master, SFX, music, ambient); gameplay SFX use Web Audio spatialization from world positions and the camera, while UI clicks and screen feedback (pause, win, lose, resume) stay non-spatial
- **Rebindable controls** - A "Controls" section in Settings (main menu and in-game menu) lists the player-facing keyboard controls in a table; click a row and press a key (or chord) to rebind it, press Escape to cancel, and a Reset button restores defaults. Bindings use physical key codes so they behave the same across keyboard layouts, and persist to localStorage
- **First-run controls intro** - The first time a level is started, a "How to play" modal explains the mouse and keyboard controls (showing the player's current bindings) and notes that controls can be reviewed later in Settings / Controls. It appears only once — the flag is remembered in localStorage, so returning players start straight into gameplay
- **Game over / victory animation** - The game-over and victory modal fades in and slides up from the bottom (with a subtle zoom, matching the Empower Next Wave panel) when a run ends, and slides back out the same way when the player restarts or returns to the main menu. Final stats stay frozen during the exit so the numbers don't change mid-animation, and interaction is blocked while it animates away
- **End-of-run stats** - The victory/defeat screen reports a fourth stat, **Total Earned** (kill rewards only), and a per-tower-type table (built on the shared `UITable` component) with **Damage** dealt (effective, clamped at 0), money **Spent** on purchases, and **Kills** (with a per-enemy-type breakdown in the kills cell). Tower and enemy rows are derived from the game config, so new types appear automatically. Only tower types that did something appear. It is ECS-backed: actions raise short-lived receipt entities (`damageDealtRequest` / `moneyEarnedRequest` / `moneySpentRequest`), and a `StatsSystem` folds them into a single per-run `IsStats` entity (composed of small atomic traits) before destroying the receipts. When a run ends, the end-state transition tags the stats entity with `RunEnded` and the stats system reacts via `world.onAdd` to fold same-frame receipts, so the screen freezes a complete snapshot. The run stats entity is spawned on run start and destroyed when returning to the main menu, so the main menu collects nothing
- **Main menu** - Editorial-style start screen with left-rail navigation, large typography, slide-in transitions, and optional GitHub/source icon (`VITE_REPOSITORY_URL` in `.env`)
- **Logo** - SVG mark for the app (`public/logo.svg` full tile, `public/logo-mark.svg` transparent mark; also `src/components/ui/assets/LogoMark.tsx` as an inline React component). Containment reticle with four hourglass-shaped layer plates that pinch toward an orange core, matching the `--primary-hex` accent. Set as the favicon in `index.html`
- **Menu parallax** - In the main menu and in-game pause menu, the tilted panels follow the cursor with a subtle eased rotation and shift, and their canvas-side edge lifts toward the viewer as the pointer nears (receding when it moves away). Off during gameplay and under `prefers-reduced-motion`
- **Time-dilation pause** - Pausing eases the world to stillness over ~200ms (enemy movement, travelling projectiles, and decorative effects slow down instead of freezing instantly) and resumes with a matching ramp; `prefers-reduced-motion` snaps instead of easing. Game logic (slow expiry, regen, heal timing, tower fire) still freezes hard the instant the pause begins, and projectile hits / enemy end-of-path damage are deferred until the world resumes
- **Level picker** - Play opens a sector list with SVG map previews, wave counts, and one-tap start for each playable level (menu-only `level_main` is not listed). Three playable sectors ship in the default build: **Sector 1** (single front), **Sector 2: The Convergence** (two fronts), and **Sector 3: The Deep Vein** (three fronts). See [Levels](#levels)
- **Enemy Almanac** - Bestiary that tracks discovered enemy types with stats and descriptions (persists to localStorage)
- **Wave controls** - Start waves early or wait for automatic wave progression
- **3D graphics** - Built with React Three Fiber for immersive gameplay
- **JSON-based configuration** - Game settings, tower stats, and level data stored in JSON files
- **Explicit loading flow** - Full-screen loading HUD while game and level configs load; `isGameConfigLoaded` and `isLevelConfigLoaded` exposed from core hooks for UI coordination
- **Simulation vs React frame order** - Wave spawning, tower combat, and instanced projectiles read `useGameStore.getState()` inside R3F `useFrame` so gameplay matches Zustand immediately after tab visibility changes (before the next React commit refreshes hook closures)
- **Desktop app (Electron)** - The game can be packaged as a native desktop application (Windows `.exe`/NSIS installer, macOS `.dmg`/`.app`, Linux AppImage/deb) and distributed outside a browser (e.g. through Steam). The packaged app serves the built `dist/` from a local loopback HTTP server (`http://127.0.0.1`, random port) instead of `file://`, so Web Workers, config fetches, and WebGL behave exactly like the web build. The renderer stays fully sandboxed (contextIsolation on, no Node integration, no `webSecurity` relaxation); links open in the OS browser
- **Playwright smoke coverage** - Canvas-aware E2E tests cover menu-to-game flow, first-tower placement, first-wave start, and editor route loading
- **Localization (i18next)** - All in-game UI text is rendered through locale keys (no hardcoded strings). A language selector in Settings → General switches the whole app live; English is the default and Russian is the first alternate language. The choice persists to localStorage (settings store) and is applied before the first render on load. Locales live in `src/core/i18n/locales/` — `en` is the reference shape (`as const`) that drives TypeScript-checked `t()` keys, and new languages are validated against it by the locale parity tests (missing or misspelled keys fail those tests). Plurals follow i18next suffix rules (`_other`, and `_one/_few/_many` for Russian). React components use `useTranslation`; R3F canvas components use the context-free `useTranslationInCanvas` hook, and non-React code (e.g. upgrade summaries) uses the shared `i18n` singleton from `src/core/i18n/i18n.ts`

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

### Desktop (Electron)

The game also runs as a desktop application via Electron.

```bash
# Dev: Vite dev server + Electron window (hot reload)
npm run dev:desktop

# Package for the current platform (produces an unpacked app in release/)
npm run build:desktop

# Build installers for the current platform / a specific platform
npm run dist        # current platform
npm run dist:win    # Windows NSIS installer + portable
npm run dist:mac    # macOS dmg + app (must run on macOS)
npm run dist:linux  # Linux AppImage + deb

# Test the packaged build without installing it
npm run run:desktop             # build (if missing) + launch the packaged
                                # binary in a window
npm run run:desktop -- --rebuild
npm run smoke:desktop           # boots the app (repo build, `electron .`)
                                # and plays through menu -> tower -> first
                                # wave, exits 0/1
npm run smoke:desktop -- --unpacked --no-sandbox
                                # smoke the *packaged* executable from
                                # release/ (built if missing). On headless
                                # machines add chromium flags, e.g.
                                # `--disable-gpu --use-angle=swiftshader`
                                # (software WebGL) — CI does exactly that.
```

Notes:

- The packaged app serves the built `dist/` from a local loopback HTTP server (`http://127.0.0.1`, random port) rather than `file://`. This gives the renderer a real origin, which is required for Web Workers (the background game loop mounts on the main menu) — under `file://` they cannot start and the game is stuck on the "Preparing graphics" loading screen. The server is loopback-only, nothing outside the machine can reach it, and no `webSecurity` relaxation is needed.
- `npm run dev:desktop` starts the Vite dev server itself if one is not already running at `http://localhost:5173` (reusing an existing one, e.g. from another terminal), so the game hot-reloads while you develop.
- F12 toggles the DevTools in the desktop app.
- **Crash diagnostics**: every renderer console message, failed load, and uncaught error is appended to `game.log` in the app's user-data folder — macOS: `~/Library/Application Support/Layer Containment/game.log`, Windows: `%APPDATA%/Layer Containment/game.log`, Linux: `~/.config/Layer Containment/game.log` (the folder is named after the product; with `dev:desktop` it is `containment-layer`). Uncaught renderer errors and renderer-process crashes (usually a GPU failure) also pop up a dialog with the error and the log path. If the app ever fails to start, that log is where the cause lives.
- The desktop app icon is `public/logo.svg` (the same SVG used as the web favicon) — electron-builder converts it into the per-platform app icons at build time: macOS `.icns` and Windows `.ico` are rasterized from the SVG, and on Linux it is placed in the freedesktop `scalable/` hierarchy. No separate icon asset to maintain.
- CI (`.github/workflows/desktop.yml`) builds installers for Windows, macOS, and Linux on every PR and push to `master`, and runs `smoke:desktop` against the packaged app, so a broken desktop build fails CI before merge.
- Distributing through Steam: publish the per-platform installer/artifact builds (NSIS exe, dmg, AppImage) as a Steam app via the Steamworks SDK. No signing/notarization is configured yet — add your code-signing certificates to CI before publishing to the Mac App Store or Steam's notarized macOS builds.

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

A dedicated, unattended stress-test entry for renderer/simulation
saturating. See [`stress/README.md`](stress/README.md) for the scenario, the
`dev:stress` / `build:stress` / `test:e2e:stress` commands, the profiling
tooling, and the optimization notes.

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
- **WASD / Q+E** (and arrow keys): Move the camera
- **ESC**: Deselect tower or open game menu
- **Space**: Pause/Resume game
- All keyboard controls are rebindable in **Settings → Controls** (defaults listed above; changes persist across sessions)

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
  - Unstoppable enemies resist slows: each tier adds slow resistance (25% / 66% / 100%), fully negating Slow Tower effects at tier 3
  - Regenerating enemies heal over time (can be countered with burst damage)

## Levels

Level data lives in `public/configs/levels/` as JSON files and is validated by the `levelConfigSchema` (zod). `PLAYABLE_LEVEL_IDS` (`src/constants/playableLevels.ts`) drives the level picker — only those ids are listed in the menu; `level_main` is the menu background scene and `stress` is wired only through the dedicated stress-test entry. A unit test (`src/core/configs/levelFiles.test.ts`) validates every playable level file against the schema and geometry (no building/water on the path, cells in bounds).

- **Sector 1** (`level_1.json`) — the opening sector: a single containment line. One serpentine front of 7 waves across a 20×20 grid.
- **Sector 2: The Convergence** (`level_2.json`) — the breach fractures into **two gates** (top-left and top-right). Each snakes down and **converges into a shared final corridor** leading to a single core at the bottom-center. This is a deliberate progression from Sector 1's single front:
  - **Two simultaneous fronts** force you to split your economy and towers across both gates instead of walling off one corridor.
  - The **shared final approach** is a chokepoint where both fronts merge — AOE, laser and chain lightning shine here, while the core becomes a "kitchen-sink" target.
  - **Ruins** (buildings) in the mid-field and **contamination pools** (water) in the bottom corners are unbuildable, splitting the map so the core can't be cheaply walled off.
  - 8 waves, 20×20 grid, $200 starting funds (a bit more than Sector 1 to cover two fronts).
  - Generated by the generic level generator below.
- **Sector 3: The Deep Vein** (`level_3.json`) — the breach's source is finally located: a hollow vein running under the core rock. **Three gates** (top-left, top-center, top-right) each zigzag down through a mined-out sector, then all three **converge into one shared vein corridor** — a full-width cross-row feeding a single final approach to the core at the bottom-center. It escalates the Convergence from two fronts to three:
  - **Three simultaneous fronts** split your economy across left / center / right; the center gate is the shortest (fastest to reach the core), the left and right are longer and winding.
  - The left and right fronts travel in **opposite directions along the shared cross-row**, so the map reads as collapsing inward toward the core — the corridor is the only place a tower reaches all three fronts at once, making AOE, laser and chain lightning the end-game pick.
  - **Mine supports and old excavation rigs** (buildings) and **molten ventings** (water) flank the core approach, blocking cheap walling of the final approach.
  - 9 waves, 20×20 grid, $250 starting funds (enough to field a tower on each front before wave 1).
  - Generated by the generic level generator below.

### Adding a level

Levels are authored in **grid coordinates** and generated by `scripts/generate-level.ts` (TypeScript, run with `npm run generate:level <name>` or `npx tsx scripts/generate-level.ts <name>`). Each level is one entry in the `LEVELS` map at the top of that script — add your level there, then run the script.

The generator reuses the app's own code so a generated level is checked the same way the game checks it:
- `src/utils/levelBuilder.ts` — converts the grid definition into a `LevelConfigData` using the editor's grid→world mapping (`tileToWaypoint`, `withRecalculatedBuildingCoordinates`, recomputed wave totals).
- `src/utils/validateLevel.ts` — the exact validation the level editor runs (`validateDraftLevel` now delegates to it), so a level that passes generation is a level the editor accepts.
- `isGridTileOnPath` — computes the true on-path tiles, and the generator rejects any building/water placed on the path, out of bounds, or overlapping a water tile (plus non-axis-aligned segments, which the editor's path tool can't produce).

Run it before committing a level; the generator fails loudly if the level is invalid. The committed `public/configs/levels/*.json` files are still covered by `src/core/configs/levelFiles.test.ts`. (The stress level is generated separately by `scripts/generate-stress-level.py`.)

## UI & HUD Architecture

- **UI primitives**: Reusable components under `src/components/ui` (`UIButton`, `UICard`, `UISlider`, `UITypography`, `UIMoney`, `UIModal`, `UIConfirmModal`) provide a consistent design system (variants, sizes, spacing) and are used across all HUD screens for buttons, cards, text, sliders, money display, and modals. `UIModal` is the shared centered dialog (Radix `Dialog` + `UICard`) that `UIConfirmModal` builds on.
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
