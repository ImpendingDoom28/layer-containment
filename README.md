# Tower Defense Game

A 3D tower defense game built with React, Tailwind CSS, and React Three Fiber.

## Features

- **Tile-based tower placement system** - Click tiles on the grid to place towers; invalid path placement shows red tower preview
- **Four tower types**:
  - Basic Tower: Fast firing, single target damage (targets nearest enemy)
  - Slow Tower: Slows enemies on hit with debuff effects
  - AOE Tower: Area of effect damage that hits multiple enemies
  - Laser Tower: Piercing beam that hits multiple enemies in a line (targets furthest enemy)
- **Three enemy types**:
  - Troop: Standard enemy with balanced stats
  - Fastero: Fast-moving enemy with lower health
  - Tankee: Slow but heavily armored enemy that causes more health loss
- **Enemy wave system** - 7 waves of increasing difficulty with configurable enemy compositions
- **Enemy upgrade system** - Optional risk/reward mechanic to empower waves for bonus gold:
  - Armored: +50% health, +40% gold reward
  - Swift: +30% speed, +30% gold reward
  - Unstoppable: Immune to slow effects, +50% gold reward
  - Regenerating: Heals 3 HP/sec, +60% gold reward
- **Economy system** - Earn money by killing enemies, spend it on towers
- **Tower management** - Click on placed towers to view info and sell them (50% refund)
- **Health system** - Lose health when enemies reach the end (varies by enemy type)
- **Audio system** - Sound effects with adjustable volume controls (master, SFX, music, ambient)
- **Main menu** - Start screen with game menu (pause, restart, audio settings)
- **Enemy Almanac** - Bestiary that tracks discovered enemy types with stats and descriptions (persists to localStorage)
- **Wave controls** - Start waves early or wait for automatic wave progression
- **3D graphics** - Built with React Three Fiber for immersive gameplay
- **JSON-based configuration** - Game settings, tower stats, and level data stored in JSON files
- **Explicit loading flow** - Full-screen loading HUD while game and level configs load; `isGameConfigLoaded` and `isLevelConfigLoaded` exposed from core hooks for UI coordination

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

### Build

```bash
npm run build
```

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
8. **Continue waves**: After each wave, start the next wave early or wait for the automatic countdown
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
  - The first wave must be started manually, giving you time to place initial towers
  - Subsequent waves start automatically after a 15-second delay (configurable)
  - You can start waves early if all enemies from the previous wave are defeated
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

## Object Pooling

The project includes object pooling implementation in `src/utils/pooling/` for optimizing projectile performance:

### Instanced Mesh Pool

React Three Fiber native pool using `instancedMesh` for single draw call rendering.

```typescript
import { useInstancedProjectiles } from "../core/hooks/useInstancedProjectiles.tsx";
import { useFrame } from "@react-three/fiber";

const { InstancedProjectiles, fireProjectile, updateProjectiles } =
  useInstancedProjectiles({
    maxProjectiles: 500,
    projectileSize: 0.1,
    onHit: (projectile) => {
      damageEnemy(projectile.targetId, projectile.damage);
    },
  });

// Render the component:
<InstancedProjectiles />;

// In useFrame:
useFrame((_, delta) => updateProjectiles(delta));

// Fire projectiles:
fireProjectile({
  startPosition: [tower.x, 1, tower.z],
  targetPosition: [target.x, 0.5, target.z],
  speed: 10,
  damage: 25,
  range: 5,
  targetId: target.id,
  towerId: tower.id,
});
```

Enjoy the game!

## UI & HUD Architecture

- **UI primitives**: Reusable components under `src/components/ui` (`UIButton`, `UICard`, `UISlider`, `UITypography`, `UIMoney`) provide a consistent design system (variants, sizes, spacing) and are used across all HUD screens for buttons, cards, text, sliders, and money display.
- **HUD layout**: HUD screens use structured wrappers in `src/components/hud`:
  - `HUDWrapper` as the root HUD overlay container on top of the 3D canvas.
  - `HUDOverlay` for centered modal-style overlays (game menu, game over).
  - `HUDSidePanel` for right-side panels (main menu, enemy almanac) with responsive widths and scrollable content.
- **Best practices**: Prefer these primitives and layout components when adding new HUD elements to keep visuals consistent, responsive, and easy to extend.
