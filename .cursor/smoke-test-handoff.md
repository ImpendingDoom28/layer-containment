# Smoke Test Handoff

## Playwright Coverage

- Command: `npm run test:e2e`
- Base URL: `http://localhost:5173/`
- Config reuses an existing dev server when available and otherwise starts one through Playwright `webServer`
- Covered flows: main menu render, Play -> gameplay HUD, Basic Tower placement via fixed canvas coordinates, first wave start, `/editor` route load with inspector accordions
- Coordinate fixtures live in `tests/e2e/fixtures/canvasPoints.ts` and assume a `1280x720` viewport
- USE THIS COMMAND TO DO TESTING AND UPDATE TESTS ACCORDINGLY
