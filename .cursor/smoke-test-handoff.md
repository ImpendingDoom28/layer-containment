# Smoke Test Handoff

## Playwright Coverage

- Command: `npm run test:e2e`
- Base URL: `http://localhost:5173/`
- Config reuses an existing dev server when available and otherwise starts one through Playwright `webServer`
- USE THIS COMMAND TO DO TESTING AND UPDATE TESTS ACCORDINGLY
- Covered flows:
  - **`tests/e2e/smoke.spec.ts`**: main menu (`Play`, `Level Creator`); in-game HUD (`Tower Shop`, `Wave:`, `Start next wave`, Empower panel not shown before wave 1); main-menu `Enemy Almanac` open/close; main-menu `Audio Settings` open/close; tower shop lists Slow/AOE/Laser (plus Basic); `Escape` → game menu → `Resume`; `Play` → `Deploy` level picker + `level-picker-level_1`; two Basic towers placed via canvas fixtures → first wave → **Empower Next Wave** modal → pick an upgrade → modal closes
  - **`tests/e2e/gameplay.spec.ts`**: Basic Tower placement via fixed canvas coordinates, first wave start (`1 / 7`)
  - **`tests/e2e/editor.spec.ts`**: `/editor` route (`editor-canvas`, `Level`, `Waves`, `Publish`)
- Shared placement helpers: `tests/e2e/fixtures/towerPlacement.ts` (`onPlaceBasicTower`, `onPlaceMultipleBasicTowers`); coordinates in `tests/e2e/fixtures/canvasPoints.ts` (`1280x720` viewport)
- The Empower smoke test uses `test.setTimeout(180_000)` and a 120s wait for the modal after wave 1 ends
