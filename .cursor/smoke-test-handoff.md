# Smoke Test Handoff

## Playwright Coverage

- Command: `npm run test:e2e`
- Base URL: `http://localhost:5173/`
- Config reuses an existing dev server when available and otherwise starts one through Playwright `webServer`
- USE THIS COMMAND TO DO TESTING AND UPDATE TESTS ACCORDINGLY
- Covered flows:
  - **`tests/e2e/smoke.spec.ts`**: main menu (`Play`, `Level Creator`); in-game HUD (`Tower Shop`, `Wave:`, `Start next wave`, Empower panel not shown before wave 1); main-menu `Enemy Almanac` open/close; main-menu `Audio Settings` open/close; tower shop lists Slow/AOE/Laser/Relay/Chain (plus Basic); `Escape` → game menu → `Resume`; `Play` → `Deploy` level picker + `level-picker-level_1`; two Basic towers placed via canvas fixtures → first wave → **Empower Next Wave** modal → pick an upgrade → modal closes
  - **`tests/e2e/controlsIntro.spec.ts`**: first-run **How to play** modal (mouse + keyboard controls, rebind-aware keys, "watch controls later in Settings/Controls" note) appears when a run starts with a clean localStorage flag, closes via `Got it` and sets `containment-layer-controls-intro-seen`; a returning player (flag preset via `onOpenGame`, which skips the intro by default) never sees it
  - **`tests/e2e/gameplay.spec.ts`**: Basic Tower placement via fixed canvas coordinates, first wave start (`1 / 7`)
  - **`tests/e2e/editor.spec.ts`**: `/editor` route (`editor-canvas`, `Level`, `Waves`, `Publish`)
  - **`tests/e2e/mobile.spec.ts`**: mobile layout at a 375x667 viewport — main menu fits the viewport, in-game HUD uses a bottom shop bar + top stats strip + mobile menu button, a tower can be selected and deselected from the bottom bar (placement is not covered at this viewport — the fixed camera does not frame the game field), and the game menu opens from the mobile menu button
- Shared placement helpers: `tests/e2e/fixtures/towerPlacement.ts` (`onPlaceBasicTower`, `onPlaceMultipleBasicTowers`); coordinates in `tests/e2e/fixtures/canvasPoints.ts` (`1280x720` viewport)
- The Empower smoke test uses `test.setTimeout(180_000)` and a 120s wait for the modal after wave 1 ends

## Known baseline (2025-10-09)

- In this headless Chromium environment the WebGL game scene does not render, so the in-game tests (`Tower Shop` heading, gameplay tower placement, shaders, game menu, Empower) **fail on a clean `master` too**. That 8-test failure set is the environmental baseline; only flag a regression if the set changes vs. `master`. Main-menu and editor-route tests pass (the editor test is occasionally flaky in full-suite runs — re-run in isolation to confirm).
- The base-health ECS refactor (`feature/ecs-health-component`) left this baseline unchanged: same 8 pre-existing failures on `master` and on the branch.
- The ECS request refactor (no action→action calls) kept the baseline unchanged too: enemy death is a `requestEnemyDeath` trait consumed by `EnemyDeathSystem` (one-frame delay at 0 HP before the kill is settled — targeting/AoE/medic skip 0-HP enemies); the system settles the kill by calling the domain's own `removeEnemy` action (actions never call actions, and no action internals are exported). End-of-path base damage is a generic `damageRequest` trait (in `src/core/ecs/traits/damage.ts`) on the base consumed by `ApplyDamageSystem` (generic damage authority, works on any entity with `HealthInfo`); `ApplyBaseDefeatSystem` raises `requestBaseDefeat` when the base is dead and `GameProcessSystem` (`runBaseDefeatSystem`) consumes it. Unit tests: 96 passing, `tsc` shows only the 6 pre-existing errors, build OK.
