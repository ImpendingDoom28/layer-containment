#!/usr/bin/env python3
"""Generate Sector 2 ("The Convergence") for the tower defense game.

Produces public/configs/levels/level_2.json.

Theme
-----
Sector 1 was a single containment line: one front, one serpentine path.
Sector 2 fractures the field. The breach splits into TWO gates (top-left and
top-right); each snakes down and CONVERGES into a shared final corridor that
leads to a single reactor core at the bottom-center of the grid.

Gameplay meaning (why the shape matters):
- Two simultaneous spawn fronts force the player to split their economy and
  towers across both gates.
- The shared final approach is a natural chokepoint where enemies from both
  fronts merge, so AOE / laser / chain lightning shine there. The core
  becomes a "kitchen sink" target.
- Contamination pools (water) in the bottom corners plus ruins (buildings) in
  the mid-field are unbuildable, splitting the map so the player cannot simply
  wall off the core cheaply.

The on-path tile set is computed with the exact same rule the game uses
(`isGridTileOnPath` in src/utils/pathUtils.ts) so every building / water tile
is guaranteed to be off the path.
"""

import json
import os

GRID_SIZE = 20
TILE_SIZE = 1
HALF = (GRID_SIZE * TILE_SIZE) / 2
PATH_WIDTH = 0.85  # matches public/configs/game.json


def tile_to_world(grid: int) -> float:
    """Map a grid coordinate to its world-space position on the surface."""
    return -HALF + grid + TILE_SIZE / 2


def wp(gx: int, gz: int) -> dict:
    """Build a path waypoint dict for grid cell (gx, gz) at surface height y=0."""
    return {"x": tile_to_world(gx), "y": 0, "z": tile_to_world(gz)}


def point_to_segment_dist(px, pz, x1, z1, x2, z2) -> float:
    """Distance from point (px, pz) to the segment (x1, z1) -> (x2, z2)."""
    dx = x2 - x1
    dz = z2 - z1
    length_sq = dx * dx + dz * dz
    if length_sq == 0:
        return ((px - x1) ** 2 + (pz - z1) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((px - x1) * dx + (pz - z1) * dz) / length_sq))
    cx = x1 + t * dx
    cz = z1 + t * dz
    return ((px - cx) ** 2 + (pz - cz) ** 2) ** 0.5


def is_tile_on_path(gx: int, gz: int, paths: list) -> bool:
    """Mirror of isGridTileOnPath: a tile is path if a waypoint lands in it,
    or any tile corner/center is within PATH_WIDTH/2 of any path segment."""
    center_x = -HALF + gx + TILE_SIZE / 2
    center_z = -HALF + gz + TILE_SIZE / 2
    half = TILE_SIZE / 2
    corners = [
        (center_x - half, center_z - half),
        (center_x + half, center_z - half),
        (center_x - half, center_z + half),
        (center_x + half, center_z + half),
        (center_x, center_z),
    ]
    for path in paths:
        for w in path:
            if (
                center_x - half <= w["x"] <= center_x + half
                and center_z - half <= w["z"] <= center_z + half
            ):
                return True
        for i in range(len(path) - 1):
            p1 = path[i]
            p2 = path[i + 1]
            for (cx, cz) in corners:
                if point_to_segment_dist(cx, cz, p1["x"], p1["z"], p2["x"], p2["z"]) <= PATH_WIDTH / 2:
                    return True
    return False


# --- Two converging fronts (grid waypoints) ---
# Left gate: top-left, snaking down, merging into the shared corridor at (9,12).
LEFT = [(3, 0), (3, 4), (7, 4), (7, 8), (3, 8), (3, 12), (9, 12), (9, 16), (9, 19)]
# Right gate: top-right, mirror, merging into the same shared corridor at (9,12).
RIGHT = [(16, 0), (16, 4), (12, 4), (12, 8), (16, 8), (16, 12), (9, 12), (9, 16), (9, 19)]

left_path = [wp(gx, gz) for (gx, gz) in LEFT]
right_path = [wp(gx, gz) for (gx, gz) in RIGHT]
paths = [left_path, right_path]

# --- Off-path props (all asserted to be off-path below) ---
# Ruins: unbuildable visual obstacles / cover in the mid-field and near the gates.
RUINS = [
    (5, 2, "box", 0.9, 0.9, 2.2, "#8b7355"),
    (14, 2, "cylinder", 0.8, 0.8, 1.9, "#6b7280"),
    (5, 6, "box", 0.86, 0.86, 2.1, "#78716c"),
    (14, 6, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
    (9, 6, "box", 0.9, 0.9, 2.3, "#8b7355"),
    (9, 10, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
    (2, 16, "box", 0.8, 0.8, 1.9, "#78716c"),
    (17, 16, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
]
# Contamination pools: unbuildable water in the bottom corners, splitting the map
# so the core cannot simply be walled off.
WATER = [
    (1, 17), (2, 17), (1, 18), (2, 18),
    (17, 17), (18, 17), (17, 18), (18, 18),
    (8, 15), (10, 15),  # two "drip" tiles flanking the shared corridor
]

# --- Waves (interleaved stream; totalEnemies = sum of counts) ---
# Escalation mirrors Sector 1 but is ~10-15% heavier to match the two fronts.
WAVES = [
    [{"type": "basic", "count": 10, "spawnInterval": 1.0}],
    [
        {"type": "basic", "count": 12, "spawnInterval": 0.8},
        {"type": "fast", "count": 4, "spawnInterval": 1.1},
        {"type": "medic", "count": 1, "spawnInterval": 1.0},
    ],
    [
        {"type": "basic", "count": 14, "spawnInterval": 0.7},
        {"type": "fast", "count": 6, "spawnInterval": 1.0},
    ],
    [
        {"type": "basic", "count": 16, "spawnInterval": 0.6},
        {"type": "fast", "count": 8, "spawnInterval": 0.9},
        {"type": "tank", "count": 2, "spawnInterval": 2.0},
        {"type": "medic", "count": 1, "spawnInterval": 1.0},
    ],
    [
        {"type": "basic", "count": 18, "spawnInterval": 0.5},
        {"type": "fast", "count": 10, "spawnInterval": 0.8},
        {"type": "tank", "count": 3, "spawnInterval": 1.5},
    ],
    [
        {"type": "basic", "count": 20, "spawnInterval": 0.45},
        {"type": "fast", "count": 12, "spawnInterval": 0.7},
        {"type": "tank", "count": 4, "spawnInterval": 1.3},
        {"type": "medic", "count": 2, "spawnInterval": 1.0},
    ],
    [
        {"type": "basic", "count": 22, "spawnInterval": 0.4},
        {"type": "fast", "count": 14, "spawnInterval": 0.6},
        {"type": "tank", "count": 5, "spawnInterval": 1.2},
    ],
    [
        {"type": "basic", "count": 26, "spawnInterval": 0.35},
        {"type": "fast", "count": 16, "spawnInterval": 0.5},
        {"type": "tank", "count": 8, "spawnInterval": 1.0},
        {"type": "medic", "count": 3, "spawnInterval": 1.0},
    ],
]


def build_wave(wave) -> dict:
    """Total the enemy counts of a wave's groups and wrap them in a WaveConfig."""
    total = sum(e["count"] for e in wave)
    return {"totalEnemies": total, "enemies": wave}


def main() -> None:
    """Validate the two fronts and write public/configs/levels/level_2.json."""
    # --- Validate the two fronts ---
    for (gx, gz) in LEFT + RIGHT:
        assert 0 <= gx < GRID_SIZE and 0 <= gz < GRID_SIZE, f"waypoint out of grid: {gx},{gz}"
    # Convergence: both fronts must end at the same core cell.
    assert LEFT[-1] == RIGHT[-1], "fronts must converge on the same core"
    # Shared final corridor: the last 3 waypoints are identical (converged).
    assert LEFT[-3:] == RIGHT[-3:], "fronts must share the final approach"
    # Axis-aligned segments (matches the editor's rectangular path tool).
    for (a, b) in list(zip(LEFT, LEFT[1:])) + list(zip(RIGHT, RIGHT[1:])):
        assert a[0] == b[0] or a[1] == b[1], f"non-axis-aligned segment {a}->{b}"

    # --- Compute the off-path tile set ---
    path_tiles = {
        (gx, gz)
        for gx in range(GRID_SIZE)
        for gz in range(GRID_SIZE)
        if is_tile_on_path(gx, gz, paths)
    }

    # --- Buildings (ruins) ---
    buildings = []
    for i, (gx, gz, shape, w, d, h, color) in enumerate(RUINS, start=1):
        assert 0 <= gx < GRID_SIZE and 0 <= gz < GRID_SIZE
        assert (gx, gz) not in path_tiles, f"building on path: {gx},{gz}"
        buildings.append(
            {
                "id": i,
                "gridX": gx,
                "gridZ": gz,
                "x": tile_to_world(gx),
                "z": tile_to_world(gz),
                "shape": shape,
                "width": w,
                "depth": d,
                "height": h,
                "color": color,
            }
        )

    # --- Water (contamination) ---
    seen_water = set()
    waters = []
    for i, (gx, gz) in enumerate(WATER, start=1):
        assert 0 <= gx < GRID_SIZE and 0 <= gz < GRID_SIZE
        assert (gx, gz) not in path_tiles, f"water on path: {gx},{gz}"
        assert (gx, gz) not in seen_water, f"duplicate water tile: {gx},{gz}"
        seen_water.add((gx, gz))
        waters.append(
            {
                "id": i,
                "gridX": gx,
                "gridZ": gz,
                "shape": "box",
                "color": "#0e7490",
            }
        )

    # No ruin may sit on a water tile (both are unbuildable; keep them distinct).
    ruin_tiles = {(b["gridX"], b["gridZ"]) for b in buildings}
    assert not (ruin_tiles & seen_water), "a ruin overlaps a water tile"

    level = {
        "name": "2",
        "startingMoney": 200,
        "gridSize": GRID_SIZE,
        "waters": waters,
        "pathWaypoints": paths,
        "waveConfigs": [build_wave(w) for w in WAVES],
        "buildings": buildings,
        "towers": [],
        "enemies": [],
        "projectiles": [],
        "enemyWeights": None,
    }

    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "configs", "levels")
    out_path = os.path.abspath(os.path.join(out_dir, "level_2.json"))
    with open(out_path, "w") as f:
        json.dump(level, f, indent=2, sort_keys=False)
        f.write("\n")

    print(f"Wrote {out_path}")
    print(f"  path tiles blocked: {len(path_tiles)}")
    print(f"  buildings (ruins): {len(buildings)}")
    print(f"  water tiles: {len(waters)}")
    print(f"  waves: {len(level['waveConfigs'])}, total enemies: {sum(w['totalEnemies'] for w in level['waveConfigs'])}")
    print(f"  core cell: {LEFT[-1]} (shared final approach {LEFT[-3:]})")


if __name__ == "__main__":
    main()
