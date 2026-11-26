import { FC, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { ThreeEvent } from "@react-three/fiber";
import { Mesh, MeshBasicMaterial, SphereGeometry } from "three";

import { resolveBoardPickCell } from "../../../utils/boardPickCell";
import {
  getPlanetRadius,
  getPlanetSphereCenter,
} from "../../../utils/planetSurfaceMapping";
import type { CanyonWorldBBox } from "../../../utils/canyonBridges";
import { freezeSubtree } from "../../../utils/freezeSubtree";

/**
 * The single invisible pick surface for a board. One sphere the size of the
 * planet (the board's cap) is the only object the board raycasts against, so
 * a pointer move costs one mesh intersection instead of one per tile. The
 * hovered / clicked cell is resolved analytically from the hit ray
 * (`resolveBoardPickCell`), never from the mesh's triangle geometry — so the
 * coarse segment count is fine and the geometry is shared.
 *
 * The surface never calls `stopPropagation`: it is the deepest hit, and
 * stopping propagation would mark it hovered-and-stopped, suppressing its own
 * `onPointerMove` dispatch on every subsequent move.
 */

// The surface's sphere geometry is rebuilt only when the radius (grid size /
// tile size) changes; the pick surface is invisible, so a modest segment
// count is plenty — the cell never comes from the triangles.
const pickSphereGeometryCache = new Map<number, SphereGeometry>();
const getPickSphereGeometry = (radius: number): SphereGeometry => {
  const entry = pickSphereGeometryCache.get(radius);
  if (entry) return entry;
  const geometry = new SphereGeometry(radius, 48, 32);
  pickSphereGeometryCache.set(radius, geometry);
  return geometry;
};

// The pick surface never draws and never disposes its material (one instance
// for the whole app, like the tile hover tints).
const pickSurfaceMaterial = new MeshBasicMaterial();

// How far (px) a pointer may travel between down and up before the surface
// treats the "click" as a drag. R3F's click dispatch has no such gate, and the
// editor camera has no drag-click suppression of its own, so the surface
// guards itself.
const CLICK_DRAG_TOLERANCE = 2;

type BoardPickSurfaceProps = {
  gridSize: number;
  tileSize: number;
  canyonBBox: CanyonWorldBBox | null;
  onHoverCell: (cell: { gridX: number; gridZ: number } | null) => void;
  onCellClick: (cell: { gridX: number; gridZ: number }) => void;
};

export const BoardPickSurface: FC<BoardPickSurfaceProps> = memo(
  ({ gridSize, tileSize, canyonBBox, onHoverCell, onCellClick }) => {
    const radius = useMemo(
      () => getPlanetRadius(gridSize, tileSize),
      [gridSize, tileSize]
    );
    const geometry = useMemo(() => getPickSphereGeometry(radius), [radius]);

    const meshRef = useRef<Mesh>(null);
    useLayoutEffect(() => {
      if (meshRef.current) freezeSubtree(meshRef.current);
    }, [geometry]);

    useEffect(
      () => () => {
        geometry.dispose();
        pickSphereGeometryCache.delete(radius);
      },
      [geometry, radius]
    );

    // Ref-gate the hover write to actual cell changes: an unconditional write
    // on every move would re-run every tile's hover selector (defeating the
    // point of a single pick surface). R3F's pointermove filter only books
    // hover state for the surface (no other board object has a move handler),
    // and its per-object id is stable across moves, so `onPointerOut` fires
    // once when the cursor leaves the board.
    const lastCellRef = useRef<{ gridX: number; gridZ: number } | null>(null);

    const onPointerMove = useCallback(
      (event: ThreeEvent<PointerEvent>) => {
        const cell = resolveBoardPickCell(
          event.ray,
          radius,
          gridSize,
          tileSize,
          canyonBBox
        );
        const last = lastCellRef.current;
        if (cell === null) {
          if (last !== null) {
            lastCellRef.current = null;
            onHoverCell(null);
          }
          return;
        }
        if (last === null || last.gridX !== cell.gridX || last.gridZ !== cell.gridZ) {
          lastCellRef.current = cell;
          onHoverCell(cell);
        }
      },
      [radius, gridSize, tileSize, canyonBBox, onHoverCell]
    );

    const onPointerOut = useCallback(() => {
      lastCellRef.current = null;
      onHoverCell(null);
    }, [onHoverCell]);

    const onClick = useCallback(
      (event: ThreeEvent<MouseEvent>) => {
        if (event.delta > CLICK_DRAG_TOLERANCE) return;
        const cell = resolveBoardPickCell(
          event.ray,
          radius,
          gridSize,
          tileSize,
          canyonBBox
        );
        if (cell) onCellClick(cell);
      },
      [radius, gridSize, tileSize, canyonBBox, onCellClick]
    );

    return (
      <mesh
        ref={meshRef}
        position={getPlanetSphereCenter(radius)}
        geometry={geometry}
        material={pickSurfaceMaterial}
        visible={false}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onClick={onClick}
      />
    );
  }
);

BoardPickSurface.displayName = "BoardPickSurface";
