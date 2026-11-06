#!/usr/bin/env python3
"""Generate a heavy stress-test level config for the tower defense game.

Produces public/configs/levels/stress.json with:
- 64x64 grid (max, 4096 tiles)
- Four serpentine paths, one per 32x32 quadrant -> 4 portals + 4 end buildings
  (each path ~32 waypoints; enemies spawn at one of the four portals and are
  split evenly across them)
- 150 pre-placed towers of all 6 types on free (non-path, non-water) cells
- 500 one-tile animated water bodies on the remaining free cells (two shades)
- 20 waves with 80-346 enemies each (~4,260 enemies total) across all five
  enemy types (basic, fast, tank, medic, splitter)
"""

import json
import os
import random

GRID_SIZE = 64
TILE_SIZE = 1
HALF = (GRID_SIZE * TILE_SIZE) / 2
QUAD = GRID_SIZE // 2  # each quadrant is 32x32

# Keep the layout reproducible run-to-run (the level is committed).
random.seed(1337)


def tile_to_world(grid: int) -> float:
    """Map a grid coordinate to its world-space position on the planet surface."""
    return -HALF + grid + TILE_SIZE / 2


def wp(gx: int, gz: int) -> dict:
    """Build a path waypoint dict for grid cell (gx, gz) at surface height y=0."""
    return {"x": tile_to_world(gx), "y": 0, "z": tile_to_world(gz)}


def quadrant_serpentine(col_start: int, row_start: int) -> list:
    """A serpentine path filling one 32x32 quadrant.

    Uses every 2nd row within the quadrant (16 rows, 32 columns each) and
    snakes left-to-right / right-to-left. The result is a single connected
    polyline: 32 waypoints, entering at one corner and leaving at the other.
    """
    path = []
    for i in range(QUAD // 2):
        r = row_start + i * 2
        left = col_start
        right = col_start + QUAD - 1
        if i % 2 == 0:
            path.append(wp(left, r))
            path.append(wp(right, r))
        else:
            path.append(wp(right, r))
            path.append(wp(left, r))
    return path


def cells_along_segment(p1: dict, p2: dict) -> list:
    """The grid cells an axis-aligned segment (between two cell centers) crosses.

    All generated segments are horizontal or vertical on grid-aligned centers,
    so this is the exact set of cells the path covers (matching the runtime
    `isGridTileOnPath` test for pathWidth 0.85, which marks only the tile the
    segment runs through).
    """
    x1, z1 = round(p1["x"] + HALF - 0.5), round(p1["z"] + HALF - 0.5)
    x2, z2 = round(p2["x"] + HALF - 0.5), round(p2["z"] + HALF - 0.5)
    cells = set()
    if z1 == z2:  # horizontal
        for c in range(min(x1, x2), max(x1, x2) + 1):
            cells.add((c, z1))
    elif x1 == x2:  # vertical
        for r in range(min(z1, z2), max(z1, z2) + 1):
            cells.add((x1, r))
    else:  # defensive: not generated, but don't crash
        raise ValueError(f"non-axis-aligned segment {(p1, p2)}")
    return cells


# --- Four paths: one serpentine per 32x32 quadrant ---
quadrants = [
    (0, 0),          # top-left
    (QUAD, 0),       # top-right
    (0, QUAD),       # bottom-left
    (QUAD, QUAD),    # bottom-right
]
path_waypoints = [quadrant_serpentine(c, r) for (c, r) in quadrants]
print(f"Paths: {len(path_waypoints)}  (waypoints each: {[len(p) for p in path_waypoints]})")

# Exact set of grid cells the path covers (across all four paths).
path_cells = set()
for path in path_waypoints:
    for i in range(len(path) - 1):
        path_cells |= cells_along_segment(path[i], path[i + 1])
print(f"Path cells (tiles): {len(path_cells)}")

# --- Free cells: in-bounds, not on the path ---
free_cells = [
    (c, r)
    for r in range(GRID_SIZE)
    for c in range(GRID_SIZE)
    if (c, r) not in path_cells
]
print(f"Free cells: {len(free_cells)}")


def spread_pick(cells, count):
    """Pick `count` cells evenly spaced (strided) from `cells` so they are
    distributed across the whole board rather than clumped in one region."""
    if count >= len(cells):
        return list(cells)
    step = len(cells) / count
    return [cells[int(i * step)] for i in range(count)]


# --- Towers: 150, spread across free cells, cycling through all 6 types ---
tower_types = ["basic", "slow", "aoe", "laser", "relay", "chain"]
# The serpentine fills every even row completely, so the free cells are exactly
# the odd rows — every one of them sits one row from the path, so all towers
# are in range to engage. Spreading across all free cells keeps them evenly
# distributed over the whole board and well spaced (~13 apart).
tower_cells = spread_pick(free_cells, 150)
towers = []
for idx, (c, r) in enumerate(tower_cells, start=1):
    towers.append(
        {
            "id": idx,
            "type": tower_types[(idx - 1) % len(tower_types)],
            "gridX": c,
            "gridZ": r,
            "x": tile_to_world(c),
            "z": tile_to_world(r),
        }
    )
tower_cell_set = set(tower_cells)
print(f"Total towers: {len(towers)}")

# --- Water: 500 one-tile animated bodies on the remaining free cells ---
water_colors = ["#0e7490", "#38bdf8"]
water_candidates = [
    (c, r)
    for r in range(GRID_SIZE)
    for c in range(GRID_SIZE)
    if (c, r) not in path_cells and (c, r) not in tower_cell_set
]
water_cells = spread_pick(water_candidates, 500)
waters = []
for idx, (c, r) in enumerate(water_cells):
    waters.append(
        {
            "id": idx + 1,
            "gridX": c,
            "gridZ": r,
            "shape": "box",
            "color": water_colors[idx % len(water_colors)],
            "width": 1,
            "depth": 1,
        }
    )
print(f"Total water bodies: {len(waters)}")

# --- Waves: 20 waves, 5 enemy types, increasing counts ---
enemy_type_list = ["basic", "fast", "tank", "medic", "splitter"]
counts = [0.40, 0.25, 0.15, 0.10, 0.10]
wave_configs = []
for w in range(20):
    total = 80 + w * 14  # 80, 94, ..., 346
    groups = []
    for i, et in enumerate(enemy_type_list):
        c = int(total * counts[i])
        if i == len(enemy_type_list) - 1:
            # The last type absorbs the rounding remainder so the group counts
            # sum exactly to the wave's totalEnemies (the spawn cap).
            c = total - sum(g["count"] for g in groups)
        if c > 0:
            # No explicit pathIndex: enemies are split evenly across the four
            # portals (round-robin) at spawn time.
            groups.append(
                {
                    "type": et,
                    "count": c,
                    "spawnInterval": max(0.1, 0.5 - w * 0.015),
                }
            )
    wave_configs.append({"totalEnemies": total, "enemies": groups})

print(f"Total waves: {len(wave_configs)}")
print(f"Wave 0: {wave_configs[0]['totalEnemies']} enemies")
print(f"Wave 19: {wave_configs[-1]['totalEnemies']} enemies")
print(f"Total enemies across all waves: {sum(w['totalEnemies'] for w in wave_configs)}")

# --- Build the level config ---
level = {
    "name": "stress",
    "label": "Stress",
    "description": (
        "Performance stress-test level: 64x64 grid, 4 portals (one per quadrant), "
        "150 towers, 500 animated water tiles, 20 waves (~4,260 enemies, all 5 types)."
    ),
    "startingHealth": 20,
    "startingMoney": 99999,
    "gridSize": GRID_SIZE,
    "tileColor": "#374151",
    "groundColor": "#1f2937",
    "waters": waters,
    "pathWaypoints": path_waypoints,
    "waveConfigs": wave_configs,
    "buildings": [],
    "towers": towers,
    "enemies": [],
    "projectiles": [],
    "enemyWeights": None,
}

# Write
out_path = "public/configs/levels/stress.json"
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w") as f:
    json.dump(level, f, indent=2)

print(f"\nWrote {out_path}")
print(f"File size: {os.path.getsize(out_path)} bytes")
