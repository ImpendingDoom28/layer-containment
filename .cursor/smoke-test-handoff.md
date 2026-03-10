# Smoke Test Handoff

## Local App
- URL: http://localhost:5173/
- Requires dev server running: `npm run dev`

## Known UI Flow
1. Loading screen -> Main menu
2. Click **Play** -> In-game HUD
3. Tower Shop (left): Basic Tower, Slow Tower, AOE Tower, Laser Tower
4. Top-right: Money, Health, Wave status, **Start next wave** button

## Smoke-Test Actions (Validated Sequence)
1. Click **Play**
2. Select **Basic Tower** (first tower in shop)
3. Place a tower on the board (click valid tile off the path)
4. Click **Start next wave**
5. Observe enemies spawning and moving along the path
6. Observe money and health changes in the HUD

## Verified Findings (Latest Run)
- Game loads and enters gameplay
- Tower placement works
- Waves start and enemies spawn
- Money changes consistent with kills (increases when enemies die)
- Health drops when enemies reach the end
- Wave progression advances to the next wave after wave completion

## Still Unverified
- Upgrade-specific parity (wave 4+ empower flow)
- Slow/debuff timing parity
- Pause/resume parity (P key)
