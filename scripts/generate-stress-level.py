#!/usr/bin/env python3
"""Generate a heavy stress-test level config for the tower defense game.

Produces public/configs/levels/stress.json with:
- 64x64 grid (max, 4096 tiles)
- Serpentine path with 64 waypoints (~2,080 strip segments, each a pair of
  box meshes -> ~4,300 path meshes)
- 150 pre-placed towers of all 6 types
- 20 waves with 50-183 enemies each (~2,330 enemies total)
"""

import json
import os

GRID_SIZE = 64
TILE_SIZE = 1
HALF = (GRID_SIZE * TILE_SIZE) / 2

def tile_to_world(grid: int) -> float:
    """Map a grid coordinate to its world-space position on the planet surface."""
    return -HALF + grid + TILE_SIZE / 2

def wp(gx: int, gz: int) -> dict:
    """Build a path waypoint dict for grid cell (gx, gz) at surface height y=0."""
    return {"x": tile_to_world(gx), "y": 0, "z": tile_to_world(gz)}

# --- Serpentine path ---
# Row 0: left→right, Row 2: right→left, Row 4: left→right, ...
# Use every 2nd row (32 rows), 2 waypoints each = 64 waypoints.
rows = list(range(0, GRID_SIZE, 2))
path = []
for i, r in enumerate(rows):
    if i % 2 == 0:
        path.append(wp(0, r))
        path.append(wp(GRID_SIZE - 1, r))
    else:
        path.append(wp(GRID_SIZE - 1, r))
        path.append(wp(0, r))

print(f"Path waypoints: {len(path)}")

# --- Towers: 150 towers spread across non-path rows ---
# Non-path rows: 1, 3, 5, ..., 61 (32 rows)
# Place 5 towers per row, spaced out, cycling through tower types.
tower_types = ["basic", "slow", "aoe", "laser", "relay", "chain"]
towers = []
tower_id = 1
tower_rows = list(range(1, GRID_SIZE, 2))  # 32 rows
towers_per_row = 5
for tr in tower_rows:
    for j in range(towers_per_row):
        # Spread towers across the row: columns 2, 8, 16, 24, 32 (offset by row for variety)
        gx = (2 + j * 12 + (tr % 6)) % GRID_SIZE
        ttype = tower_types[(tower_id - 1) % len(tower_types)]
        towers.append({
            "id": tower_id,
            "type": ttype,
            "gridX": gx,
            "gridZ": tr,
            "x": tile_to_world(gx),
            "z": tile_to_world(tr),
        })
        tower_id += 1
        if tower_id > 150:
            break
    if tower_id > 150:
        break

# Trim to exactly 150
towers = towers[:150]
print(f"Total towers: {len(towers)}")

# --- Waves: 20 waves, increasing enemy counts ---
enemy_type_list = ["basic", "fast", "tank", "medic"]
wave_configs = []
for w in range(20):
    total = 50 + w * 7  # 50, 57, 64, ..., 189
    counts = [0.5, 0.25, 0.15, 0.10]
    groups = []
    for i, et in enumerate(enemy_type_list):
        c = int(total * counts[i])
        if i == len(enemy_type_list) - 1:
            c = total - sum(g["count"] for g in groups)
        if c > 0:
            groups.append({
                "type": et,
                "count": c,
                "spawnInterval": max(0.1, 0.5 - w * 0.015),
            })
    wave_configs.append({
        "totalEnemies": total,
        "enemies": groups,
    })

print(f"Total waves: {len(wave_configs)}")
print(f"Wave 0: {wave_configs[0]['totalEnemies']} enemies")
print(f"Wave 19: {wave_configs[-1]['totalEnemies']} enemies")
print(f"Total enemies across all waves: {sum(w['totalEnemies'] for w in wave_configs)}")

# --- Build the level config ---
level = {
    "name": "stress",
    "label": "Stress",
    "description": "Performance stress-test level: 64x64 grid, 150 towers, 20 waves.",
    "startingHealth": 20,
    "startingMoney": 99999,
    "gridSize": GRID_SIZE,
    "tileColor": "#374151",
    "groundColor": "#1f2937",
    "waters": [],
    "pathWaypoints": [path],
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
