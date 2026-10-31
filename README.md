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
- **Five enemy types**:
  - Troop: Standard enemy with balanced stats
  - Fastero: Fast-moving enemy with lower health
  - Tankee: Slow but heavily armored enemy that causes more health loss
  - Medic: Periodically heals nearby allies (not itself); pulse timing respects game pause; a short ring burst plays when the area heal fires
  - Splitter: On death it bursts into a random 2–4 weaker shrapnel that continue along the path and pay no gold (no `+$0` float). Each child spawns at a small random offset along the path (a bounded progress stagger) so the shrapnel scatter around the death point instead of stacking — a single AOE shot can't clear the whole cluster and the burst reads as a spread, not a clump. ECS-backed like the effects: the death system raises a short-lived `splitRequest` trait (carrying the death location and the parent's `split` config), and the `EnemySplitSystem` consumes it to spawn the children. Children never carry the `split` config, so the swarm is bounded to one generation. Splitters only appear in the in-game levels (Sector 1 & 2 waves), not the main-menu scene
- **Enemy wave system** - 7 waves of increasing difficulty with configurable enemy compositions
- **Level creator** - Dedicated `/editor` route with a mode rail, contextual inspector, and unified publish flow for placing buildings, drawing paths, painting non-buildable water bodies (same schema shape as buildings; stored in `waters` in level JSON), configuring waves, and exporting schema-compatible level JSON files
- **Terrain** - Buildable land tiles use a procedural regolith-style surface (shader speckle / micro-patches on the top face only) plus sparse instanced rock props; path cells and water stay visually distinct; level editor matches the same treatment on land tiles
- **Enemy upgrade system** - After each wave (except before wave 1), pick one of three random upgrades; choices stack for the rest of the level and apply to all spawns. Full-screen blur modal blocks other UI until you choose. The same upgrade can be taken up to three times with stronger effects each tier; at three tiers it is maxed and removed from the pool. Upgrades: Armored (+health), Swift (+speed), Unstoppable (slow resistance per tier, full slow immunity at tier 3), Regenerating (HP regen), and Reinforcements (each wave spawns more enemies — +20% at tier 1, +40% at tier 2, +65% at tier 3 — applied to every enemy group's count, rounded up, so the relative mix is preserved), with tier-scaled gold rewards. The upgrade panel shows every previously chosen upgrade in a "Selected upgrades" strip (name, tier, and its stacked gold bonus, e.g. `Armored II +116% gold`) so you can see what you already have. The game stats card also carries a "Selected upgrades" button that lists the picked upgrades as one entry each (name, tier, and its stacked gold bonus) and opens a modal with the full list; it appears as soon as the first upgrade is picked and stays visible for the rest of the level so you can re-check it mid-game without pausing (opening the modal blocks camera control, like the menus)
- **Upgrade visuals on enemies** - Each pick is shown as a physical effect on the enemy (1 pick = 1, 3 picks = 3), showing what the upgrade does: small 3D shield plates in front of the body for Armored, a shallow purple glow shell hugging the body for Unstoppable, a subtle green ground ring (thin, wider than the body, growing per tier) emitting a stream of green particles that rise from the ring's edge for Regenerating, and white speed straps trailing behind the enemy along its travel direction for Swift. Reinforcements tints the spawn portal more orange per tier and adds one pulsing ring per pick, so the upgrade is visible at the portal itself
- **Economy system** - Earn money by killing enemies, spend it on towers
- **Tower management** - Click on placed towers to view info and sell them (50% refund)
- **Audio system** - Sound effects with adjustable volume controls (master, SFX, music, ambient); gameplay SFX use Web Audio spatialization from world positions and the camera, while UI clicks and screen feedback (pause, win, lose, resume) stay non-spatial
- **Rebindable controls** - A "Controls" section in Settings (main menu and in-game menu) lists the player-facing keyboard controls in a table; click a row and press a key (or chord) to rebind it, press Escape to cancel, and a Reset button restores defaults. Bindings use physical key codes so they behave the same across keyboard layouts, and persist to localStorage
- **Control schemes** - Settings / Controls offers two switchable presets: **Keyboard** (the classic WASD/Q+E) and **Touch (mobile)** (a numpad-style number-row layout for screens without WASD). Switching a scheme resets the whole binding set to that preset (and persists it); individual keys can still be rebound afterwards. On a mobile viewport with the Touch scheme selected, two on-screen controls appear in a two-thumb layout: a **D-pad** (bottom-right, mirroring the numpad layout) that drives the camera — hold a button to move, release to stop — and a **rotation joystick** (bottom-left, the touch analog of mouse-drag) that rotates the camera as you drag it
- **First-run controls intro** - The first time a level is started, a "How to play" modal explains the mouse and keyboard controls (showing the player's current bindings) and notes that controls can be reviewed later in Settings / Controls. It appears only once — the flag is remembered in localStorage, so returning players start straight into gameplay
- **Game over / victory animation** - The game-over and victory modal fades in and slides up from the bottom (with a subtle zoom, matching the Empower Next Wave panel) when a run ends, and slides back out the same way when the player restarts or returns to the main menu. Final stats stay frozen during the exit so the numbers don't change mid-animation, and interaction is blocked while it animates away
- **End-of-run stats** - The victory/defeat screen reports a fourth stat, **Total Earned** (kill rewards only), and a per-tower-type table (built on the shared `UITable` component) with **Damage** dealt (effective, clamped at 0), money **Spent** on purchases, and **Kills** (with a per-enemy-type breakdown in the kills cell). Tower and enemy rows are derived from the game config, so new types appear automatically. Only tower types that did something appear. It is ECS-backed: actions raise short-lived receipt entities (`damageDealtRequest` / `moneyEarnedRequest` / `moneySpentRequest`), and a `StatsSystem` folds them into a single per-run `IsStats` entity (composed of small atomic traits) before destroying the receipts. When a run ends, the end-state transition tags the stats entity with `RunEnded` and the stats system reacts via `world.onAdd` to fold same-frame receipts, so the screen freezes a complete snapshot. The run stats entity is spawned on run start and destroyed when returning to the main menu, so the main menu collects nothing
- **Main menu** - Editorial-style start screen with left-rail navigation, large typography, slide-in transitions, and optional GitHub/source icon (`VITE_REPOSITORY_URL` in `.env`). Behind the ambient enemies, the menu renders the same planet tiles as the in-game scene: the `level_main` board with the regolith-shaded land tiles, the path, and the instanced rock props — purely visual (no tower placement, no hover highlights)
- **Logo** - SVG mark for the app (`public/logo.svg` full tile, `public/logo-mark.svg` transparent mark; also `src/components/ui/assets/LogoMark.tsx` as an inline React component). Containment reticle with four hourglass-shaped layer plates that pinch toward an orange core, matching the `--primary-hex` accent. Set as the favicon in `index.html`
- **Menu parallax** - In the main menu and in-game pause menu, the tilted panels follow the cursor with a subtle eased rotation and shift, and their canvas-side edge lifts toward the viewer as the pointer nears (receding when it moves away). Off during gameplay, on mobile (the tilt is disabled below the `md` breakpoint), and under `prefers-reduced-motion`
- **Time-dilation pause** - Pausing eases the world to stillness over ~200ms (enemy movement, travelling projectiles, and decorative effects slow down instead of freezing instantly) and resumes with a matching ramp; `prefers-reduced-motion` snaps instead of easing. Game logic (slow expiry, regen, heal timing, tower fire) still freezes hard the instant the pause begins, and projectile hits / enemy end-of-path damage are deferred until the world resumes
- **Level picker** - Play opens a sector list with SVG map previews, each level's `label` as the title, a one-line `description`, the wave count, and one-tap start for each playable level (menu-only `level_main` is not listed). Three playable sectors ship in the default build: **Sector 1** (single front), **Sector 2: The Convergence** (two fronts), and **Sector 3: The Coil** (a spiraling single channel). See [Levels](#levels)
- **3D asset showcase (`/testing-level`)** - A non-playable route that displays the whole 3D model roster at once: every enemy type, every tower type and its projectile, buildings (box + cylinder), water bodies, the path with its spawn portal and end building — laid out one tile apart in rows on a 20×20 board. The level loads through the same `LevelSystem` / level-config pipeline as playable levels (`level_testing.json`), but the scene intentionally skips `EntitiesSystem` so no movement, tower-fire, projectile, death or split systems run: enemies and towers spawn and then simply render in place as a frozen snapshot. The level's static projectiles (not fired by any tower) are drawn by a dedicated `StaticProjectiles` component that mirrors the in-game instanced-pool shapes (sphere for single/AoE, oriented cylinder for the laser beam and chain bolt, plus an AoE blast-radius ring). **Every enemy upgrade is showcased at all its tiers** (armored, swift, slow-resistance, regenerating) on `basic` enemies in a zone spaced from the base assets, and the **reinforcements** upgrade is shown as a row of spawn portals (tiers 1–3, warming green→orange with one pulsing ring per pick) — the in-game `Path` portal always renders at tier 0, so the scene renders these showcase portals directly. A `PerspectiveCamera` + drei `OrbitControls` frame the board so it can be orbited and zoomed to inspect any asset. The route is always reachable by navigating to `/testing-level`; a **Testing Level** button also appears in the main menu (directly below Level Creator) but **only in dev builds** — it is gated behind `import.meta.env.DEV`, so it is stripped from production while the URL remains available.
- **Mobile support (adaptive HUD/GUI)** - The HUD and GUI adapt to narrow screens (below the 768px `md` breakpoint): the tower shop becomes a horizontally scrollable bottom bar of compact tower buttons (scrollbar hidden), the money/health/wave HUD collapses into a compact top strip with the card background (the "Start next wave" button and the game menu button live inside the strip — desktop uses ESC), the main menu panel spans the full width, side panels (menu, almanac, level picker, game menu) are full-width with reduced padding, and the game-over stats wrap. `useIsMobile` (`src/core/hooks/useIsMobile.ts`) mirrors the Tailwind `md` breakpoint for layout switching, and the page tracks the mobile browser chrome via `100dvh` sizing
- **Almanac** - Reference panel with a tab selector between three sections: **Enemies** (bestiary that tracks discovered enemy types with stats and descriptions, persisting to localStorage), **Towers** (every tower type with its cost, damage, range, fire rate, targeting, and type-specific traits like slow/AoE/pierce/relay/chain), and **Upgrades** (every enemy upgrade with its effect and gold bonus). Discovery state also drives the in-game **next-wave preview**: enemies you haven't met yet appear as a masked "???" entry (neutral color, italic) instead of revealing their name, matching how the almanac shows undiscovered enemies
- **Wave controls** - Start waves early or wait for automatic wave progression
- **3D graphics** - Built with React Three Fiber for immersive gameplay
- **Frustum culling for entities** - Enemy and tower groups are culled against the camera view each frame: when a group's bounding sphere leaves the view (with a 2-unit hysteresis margin so fast units don't pop at the edge) its `visible` is toggled off and three.js skips the whole subtree in the render pass. Toggling `visible` doesn't remount anything and doesn't affect raycasting (three tests `layers`, not `visible`), so hover and click keep working. The bounding sphere is measured once per group and re-measured when a descendant's transform changes (a heal ring scaling up, an upgrade ring appearing) — detected cheaply by comparing a per-group transform snapshot each frame, so steady-state frames skip the bounding-box walk. The per-frame view frustum is built once and shared across all culled objects, and only rebuilt when the camera actually moves, rotates, or changes its FOV. The preview tower is exempt (it follows the cursor and is always in view). Separately, while the camera is being dragged with the mouse, R3F's full-scene raycast (normally fired on every `pointermove`) is suppressed in the capture phase, so dragging the camera stays smooth. That suppression has two follow-up costs the camera handles itself: R3F's click-distance check only gates `onPointerMissed` — a `click` after a drag would still dispatch `onClick` to the hit object and place a tower — so the camera swallows the click in the capture phase when the pointer travelled beyond R3F's own 2px threshold; and with no `pointermove` R3F never un-hovers the tile under the cursor, so on release the camera re-dispatches a `pointermove` on the canvas at the final position to reconcile the hover highlight
- **JSON-based configuration** - Game settings, tower stats, and level data stored in JSON files
- **Explicit loading flow** - Full-screen black loading HUD while game and level configs load: the loading text in the bottom-right corner with an indeterminate loading bar (the animated SYSTEMS ONLINE badge line) below it, which slides in from the left on mount and slides out to the right before unmounting (via a shared `useLoadingTransition` hook that keeps the overlay mounted until the exit finishes); `isGameConfigLoaded` and `isLevelConfigLoaded` exposed from core hooks for UI coordination
- **Simulation vs React frame order** - Wave spawning, tower combat, and instanced projectiles read `useGameStore.getState()` inside R3F `useFrame` so gameplay matches Zustand immediately after tab visibility changes (before the next React commit refreshes hook closures)
- **Desktop app (Electron)** - The game can be packaged as a native desktop application (Windows `.exe`/NSIS installer, macOS `.dmg`/`.app`, Linux AppImage/deb) and distributed outside a browser (e.g. through Steam). The packaged app serves the built `dist/` from a local loopback HTTP server (`http://127.0.0.1`, random port) instead of `file://`, so Web Workers, config fetches, and WebGL behave exactly like the web build. The renderer stays fully sandboxed (contextIsolation on, no Node integration, no `webSecurity` relaxation); links open in the OS browser
- **PWA (installable web app)** - The game is a progressive web app: `public/manifest.webmanifest` declares the app identity (name, theme color, standalone display) and 192/512px icons in both `any` and `maskable` purposes, and `index.html` links the manifest plus an `apple-touch-icon` and `theme-color` meta. A service worker (`public/sw.js`) precaches the app shell (HTML, manifest, icons) at install, serves navigations network-first with an offline fallback to the cached shell, and serves other same-origin assets cache-first with a background refresh — so the game loads offline after the first online visit. Registration (`src/core/pwa/registerServiceWorker.ts`) runs only in production builds on secure origins (https or localhost), so the dev server and the packaged desktop app are unaffected. Browsers can offer "Install app"; the installed app opens in a standalone window. `public/_headers` sets the manifest's `Content-Type` to `application/manifest+json` for the Netlify deployment (some browsers, e.g. Firefox, need the right MIME type to install)
- **Playwright smoke coverage** - Canvas-aware E2E tests cover menu-to-game flow, first-tower placement, first-wave start, and editor route loading; a separate PWA suite (`npm run test:e2e:pwa`, run against `vite preview` because service workers need a production build) verifies the manifest, icon delivery, and service worker registration
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

A separate PWA suite verifies the web app manifest, icon delivery, and service worker registration:

```bash
npm run test:e2e:pwa
```

It runs against a production build (`vite preview` on port 5198, built and started automatically) because the service worker only registers in production builds on secure origins — the dev-server suite excludes `pwa.spec.ts` for the same reason.

### Vitest + RTTR Unit Tests

```bash
npm run test:unit
```

Vitest runs React Three Fiber unit tests with `@react-three/test-renderer` without a real browser or WebGL context. Use these tests for focused scene-graph and `useFrame` behavior; keep Playwright for full app, routing, HUD, and canvas interaction flows.

### Build

```bash
npm run build
```

### Commit Conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) — `type(scope): subject`, e.g. `feat(towers): add slow tower` or `fix(levels): stop wave counter drifting`.

- **Type**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Scope** (optional): the affected area, kebab-case — `levels`, `towers`, `hud`, `ecs`, `stats`, `main-menu`, …
- **Subject**: imperative mood, no trailing period, ~72 chars (the hook enforces a 100-char header limit).

Enforcement is two-tiered:

1. **Local** — a [`husky`](https://typicode.github.io/husky/) `commit-msg` hook runs [commitlint](https://commitlint.js.org/) (`npm run lint:commit`) on every commit, so a non-conforming message is rejected before it lands. The rules live in [`commitlint.config.mjs`](commitlint.config.mjs).
2. **CI** — a [GitHub Actions](.github/workflows/ci.yml) job re-checks every PR's commit messages with commitlint as a backstop, since local hooks can be bypassed.

To lint a single commit by hand: `npx commitlint --last` (checks the most recent commit), or pipe a message: `echo "feat: x" | npx commitlint`.

### Branch Naming

All branches must start with `feature/`, `bugfix/`, `ci/`, `refactor/` or
`chore/` — e.g. `feature/slow-tower`. Note the prefix is `feature/`, not
`feat/`. The mainline `master` is the only exception.

Enforced locally by the [`husky`](https://typicode.github.io/husky/)
`pre-push` hook: a push containing any other branch name is rejected with a
list of the offending branches. Ref deletions, tags, and pushes to `master`
are not affected.

### Pre-push Verification (husky)

The `pre-push` hook first validates the branch names being pushed (see
[Branch Naming](#branch-naming)) and then runs `npm run verify` (build +
unit + e2e) before a push, but only when the push could affect the app. It diffs the refs you push
against their previous remote state (for a new branch, against the merge base
with `master`) and skips verify when every changed file is non-code: all
`*.md` files, `docs/`, `package-lock.json` (alone), and other generated/log
files. Any change to source or app config (`.ts`, `.tsx`, `.js`, `.css`,
`.html`, …) runs the full verify. Ref deletions change no app code, so they
skip too. When the hook cannot determine the changed files, it verifies.

```bash
# docs-only push: verify is skipped
git commit -am "docs: update README" && git push   # → skip message
```

### Performance Stress Test

A dedicated, unattended stress-test entry for renderer/simulation
saturating. See [`stress/README.md`](stress/README.md) for the scenario, the
`dev:stress` / `build:stress` / `test:e2e:stress` commands, the profiling
tooling, and the optimization notes.

### Live Browser Checks (for AI agents)

Agents can verify the app in a browser (any browser MCP works, or Playwright for scripted checks):

1. Assume the dev server is already started
2. Open `http://localhost:5173`
3. Wait for the main menu or game HUD to render
4. Perform smoke checks (e.g. click Play, place a tower, start a wave)

The dev server uses a fixed port (`5173`) and `strictPort: true`, so the URL is always predictable.

## How to Play

1. **Start the game**: Click "Play" on the main menu to enter the game
2. **View the almanac**: Click "Almanac" to see the reference panel — the Enemies tab shows discovered enemies (undiscovered show as silhouettes), and the Towers and Upgrades tabs list every tower and upgrade with their stats
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
- **Control schemes**: **Settings → Controls** has a scheme switcher — **Keyboard** (WASD/Q+E) and **Touch (mobile)** (numpad-style number row: 8/2 = forward/backward, 4/6 = left/right, 9/3 = up/down). On touch screens with the Touch scheme selected, two in-game controls appear in a two-thumb layout: a **D-pad** (bottom-right) that drives the same camera moves — hold to move, release to stop — and a **rotation joystick** (bottom-left, the touch analog of mouse-drag) that rotates the camera as you drag. Switching schemes resets the bindings to that preset; per-key rebinding still works afterwards

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
- **Almanac**:
  - Accessed from the main menu, with a tab selector for the three sections
  - **Enemies** tab: undiscovered enemies appear as silhouettes with "???" names, revealed when you encounter them in battle; discovery progress persists across browser sessions via localStorage
  - **Towers** tab: lists every tower with cost, damage, range, fire rate, targeting, and type-specific traits (slow, area, pierce, neighbor buff, chain)
  - **Upgrades** tab: lists every enemy upgrade with its effect and gold bonus
- **Enemy Upgrades** (Risk/Reward System):
  - Between waves (starting from wave 4), you can optionally "empower" the next wave
  - Select upgrades to make enemies stronger in exchange for bonus gold rewards
  - Upgrades unlock progressively:
    - Waves 4-6: Tier 1 upgrades (Armored, Swift), max 1 upgrade
    - Waves 7-10: Tier 1-2 upgrades (adds Unstoppable, Regenerating), max 2 upgrades
    - Waves 11+: All tiers, max 3 upgrades
  - Upgrade effects stack multiplicatively for gold rewards
  - Upgraded enemies show a physical effect per pick (1 pick = 1, 3 picks = 3): shield plates in front (Armored), purple glow shell (Unstoppable), ground ring that grows per tier with rising green energy (Regenerating), white speed straps trailing behind (Swift)
  - Unstoppable enemies resist slows: each tier adds slow resistance (25% / 66% / 100%), fully negating Slow Tower effects at tier 3
  - Regenerating enemies heal over time (can be countered with burst damage)
- **Enemy Facing**: every enemy spawns facing along the path (the direction of travel at its spawn point) and its facing refreshes each frame with a smooth turn, so all enemy types — including splitter children — always face down the path, around corners, and from any spawn point

## Levels

Level data lives in `public/configs/levels/` as JSON files and is validated by the `levelConfigSchema` (zod). `PLAYABLE_LEVEL_IDS` (`src/constants/playableLevels.ts`) drives the level picker — only those ids are listed in the menu; `level_main` is the menu background scene, `level_testing` is the non-playable 3D asset showcase (the `/testing-level` route, described in the Features list above), and `stress` is wired only through the dedicated stress-test entry. A unit test (`src/core/configs/levelFiles.test.ts`) validates every playable level file against the schema and geometry (no building/water on the path, cells in bounds), and `level_testing.json` is separately checked for schema validity and a full asset roster.

- **Sector 1** (`level_1.json`) — the opening sector: a single containment line. One serpentine front of 7 waves across a 20×20 grid.
- **Sector 2: The Convergence** (`level_2.json`) — the breach fractures into **two gates** (top-left and top-right). Each snakes down and **converges into a shared final corridor** leading to a single core at the bottom-center. This is a deliberate progression from Sector 1's single front:
  - **Two simultaneous fronts** force you to split your economy and towers across both gates instead of walling off one corridor.
  - The **shared final approach** is a chokepoint where both fronts merge — AOE, laser and chain lightning shine here, while the core becomes a "kitchen-sink" target.
  - **Ruins** (buildings) in the mid-field and **contamination pools** (water) in the bottom corners are unbuildable, splitting the map so the core can't be cheaply walled off.
  - 8 waves, 20×20 grid, $200 starting funds (a bit more than Sector 1 to cover two fronts).
  - Hand-authored in `public/configs/levels/` (JSON) and checked by `src/core/configs/levelFiles.test.ts` in CI.
- **Sector 3: The Coil** (`level_3.json`) — the vein is a spiral, not a corridor: a **single channel** enters at top-left and winds inward in concentric loops — outer ring, mid ring, inner ring — ending at a core in the **map's center** (grid (10,11)). It changes the shape of the problem instead of adding fronts:
  - **Concentric coverage**: the loops are 2 tiles apart, so a tower placed between two rings reaches **multiple path segments at once** — one tower can cover the outer, mid and inner rings together, which no corridor level allows.
  - The **124-tile single gauntlet** is the longest path of any sector (Sector 1: 26, Sector 2: 33/34): enemies spend a long time in range, and the nested loops leave far fewer dead zones than the far corners of multi-front maps.
  - Two small **pockets around the core** (the rings at grid (8,8) and (10,11)) are the "kitchen sink" — the last stop before the core where everything converges.
  - Rocks are cooled mineral crust and the corner pools are molten vents — unbuildable, they pin the outer loop so the entry can't be walled off.
  - 9 waves, 20×20 grid, $250 starting funds.
  - Hand-authored in `public/configs/levels/` (JSON) and checked by `src/core/configs/levelFiles.test.ts` in CI.

### Adding a level

Levels are hand-authored JSON files in `public/configs/levels/` (`LevelConfigData` from `src/core/configs/levelConfig.ts`): `pathWaypoints` in world coordinates (grid cell `(gX, gZ)` maps to `(-gridSize/2 + gX + tileSize/2, 0, -gridSize/2 + gZ + tileSize/2)` with the game's `tileSize`), `buildings`/`waters` in `gridX`/`gridZ` (their world `x`/`z` are recomputed from the grid at load), `waveConfigs` with `totalEnemies` as the per-wave spawn cap. Register the id in `src/constants/playableLevels.ts` (and the `LevelConfigFiles` union in `src/core/configs/levelConfig.ts`).

Each level also carries **display metadata** and its own **base health**:

- `label` — a short human-facing name shown as the card title in the level picker (falls back to `name`, then the level id). Defaults to `""`.
- `description` — a one-line blurb shown under the label in the level picker. Defaults to `""`.
- `startingHealth` — the player base's max health for that level (each level can have its own). Defaults to `20`. Previously a single `startingHealth` lived in `game.json`; it is now per-level, so the base spawned at run start uses the selected level's value.

All three are editable in the Level Creator (`/editor`, Level panel). The level picker shows `label` as the title and `description` (with the wave count) as the subtitle; the menu scene (`level_main`), the 3D showcase (`level_testing`) and the stress entry still validate against the same schema but do not spawn a base from these values.

Every playable level is checked in CI by `src/core/configs/levelFiles.test.ts`, which enforces: schema validity, at least one path (≥2 waypoints) and one wave (≥1 enemy per wave), buildings/waters never on the path, everything within grid bounds, path segments axis-aligned (the editor's path tool is orthogonal), and no duplicate or overlapping building/water tiles. Run `npm run test:unit` before committing. (The stress level is generated separately by `scripts/generate-stress-level.py`.)

## UI & HUD Architecture

- **UI primitives**: Reusable components under `src/components/ui` (`UIButton`, `UICard`, `UISlider`, `UITypography`, `UIMoney`, `UIModal`, `UIConfirmModal`) provide a consistent design system (variants, sizes, spacing) and are used across all HUD screens for buttons, cards, text, sliders, money display, and modals. `UIModal` is the shared centered dialog (Radix `Dialog` + `UICard`) that `UIConfirmModal` builds on.
- **HUD layout**: HUD screens use structured wrappers in `src/components/hud`:
  - `HUDWrapper` as the root HUD overlay container on top of the 3D canvas.
  - `HUDOverlay` for centered modal-style overlays (game menu, game over).
  - `HUDSidePanel` for right-side panels (main menu, almanac) with responsive widths and scrollable content.
- **Best practices**: Prefer these primitives and layout components when adding new HUD elements to keep visuals consistent, responsive, and easy to extend.

## Other

Here are documentation links:

- [threejs](https://threejs.org/docs/)
- [react-three-fiber](https://r3f.docs.pmnd.rs/)
- [react-three-drei](https://drei.docs.pmnd.rs/)
