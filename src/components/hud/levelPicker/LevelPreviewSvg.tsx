import type { FC } from "react";

import type { Building, PathWaypoint } from "../../../core/types/game";
import { cn } from "../../ui/lib/twUtils";

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const emptyBounds = (): Bounds => ({
  minX: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
});

const expandBounds = (b: Bounds, x: number, y: number) => {
  b.minX = Math.min(b.minX, x);
  b.maxX = Math.max(b.maxX, x);
  b.minY = Math.min(b.minY, y);
  b.maxY = Math.max(b.maxY, y);
};

const expandRect = (
  b: Bounds,
  left: number,
  right: number,
  top: number,
  bottom: number
) => {
  expandBounds(b, left, top);
  expandBounds(b, right, bottom);
};

const toSvg = (x: number, z: number) => ({ sx: x, sy: z });

type LevelPreviewSvgProps = {
  pathWaypoints: PathWaypoint[][];
  buildings: Building[];
  gridSize: number;
  tileSize: number;
  className?: string;
};

export const LevelPreviewSvg: FC<LevelPreviewSvgProps> = ({
  pathWaypoints,
  buildings,
  gridSize,
  tileSize,
  className,
}) => {
  const gridOffset = -(gridSize * tileSize) / 2;
  const b = emptyBounds();

  for (const path of pathWaypoints) {
    for (const wp of path) {
      const { sx, sy } = toSvg(wp.x, wp.z);
      expandBounds(b, sx, sy);
    }
  }

  for (const building of buildings) {
    const cx = gridOffset + building.gridX + tileSize / 2;
    const cz = gridOffset + building.gridZ + tileSize / 2;
    const left = cx - building.width / 2;
    const right = cx + building.width / 2;
    const front = cz - building.depth / 2;
    const back = cz + building.depth / 2;
    const t1 = toSvg(left, front);
    const t2 = toSvg(right, back);
    expandRect(b, t1.sx, t2.sx, t1.sy, t2.sy);
  }

  if (!Number.isFinite(b.minX)) {
    const half = (gridSize * tileSize) / 2;
    const c1 = toSvg(-half, -half);
    const c2 = toSvg(half, half);
    expandRect(b, c1.sx, c2.sx, c1.sy, c2.sy);
  }

  const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.06 || 0.5;
  const vbX = b.minX - pad;
  const vbY = b.minY - pad;
  const vbW = b.maxX - b.minX + pad * 2;
  const vbH = b.maxY - b.minY + pad * 2;

  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const z0 = gridOffset;
  const z1 = gridOffset + gridSize * tileSize;
  const x0 = gridOffset;
  const x1 = gridOffset + gridSize * tileSize;
  for (let i = 0; i <= gridSize; i++) {
    const x = gridOffset + i * tileSize;
    const pA = toSvg(x, z0);
    const pB = toSvg(x, z1);
    gridLines.push({ x1: pA.sx, y1: pA.sy, x2: pB.sx, y2: pB.sy });
  }
  for (let j = 0; j <= gridSize; j++) {
    const z = gridOffset + j * tileSize;
    const pA = toSvg(x0, z);
    const pB = toSvg(x1, z);
    gridLines.push({ x1: pA.sx, y1: pA.sy, x2: pB.sx, y2: pB.sy });
  }

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className={cn("h-full w-full overflow-visible", className)}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <rect
        x={vbX}
        y={vbY}
        width={vbW}
        height={vbH}
        className="fill-muted/30"
      />
      {gridLines.map((line) => (
        <line
          key={`g-${line.x1}-${line.y1}-${line.x2}-${line.y2}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          className="stroke-border/40"
          strokeWidth={Math.max(vbW, vbH) * 0.002}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {buildings.map((building) => {
        const cx = gridOffset + building.gridX + tileSize / 2;
        const cz = gridOffset + building.gridZ + tileSize / 2;
        const left = cx - building.width / 2;
        const right = cx + building.width / 2;
        const front = cz - building.depth / 2;
        const back = cz + building.depth / 2;
        const t1 = toSvg(left, front);
        const t2 = toSvg(right, back);
        const rx = Math.min(t1.sx, t2.sx);
        const ry = Math.min(t1.sy, t2.sy);
        const rw = Math.abs(t2.sx - t1.sx);
        const rh = Math.abs(t2.sy - t1.sy);
        return (
          <rect
            key={building.id}
            x={rx}
            y={ry}
            width={rw}
            height={rh}
            rx={building.shape === "cylinder" ? rw / 2 : rw * 0.08}
            className="fill-muted-foreground/35 stroke-muted-foreground/50"
            strokeWidth={Math.max(vbW, vbH) * 0.003}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      <g className="text-primary">
        {pathWaypoints.map((path) => {
          if (path.length === 0) return null;
          const pts = path.map((wp) => {
            const { sx, sy } = toSvg(wp.x, wp.z);
            return `${sx},${sy}`;
          });
          const pathKey = path.map((wp) => `${wp.x},${wp.z}`).join("|");
          return (
            <polyline
              key={pathKey}
              fill="none"
              points={pts.join(" ")}
              stroke="currentColor"
              strokeWidth={Math.max(vbW, vbH) * 0.012}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{
                filter: "drop-shadow(0 0 3px hsl(var(--primary) / 0.4))",
              }}
            />
          );
        })}
      </g>
    </svg>
  );
};
