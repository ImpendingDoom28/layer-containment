import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AdditiveBlending, Ray, type Points, type PointsMaterial } from "three";

import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useLevelStore } from "../../../core/stores/useLevelStore";
import { useSettingsStore } from "../../../core/stores/useSettingsStore";
import { AmbientDust } from "./AmbientDust";

// The node environment has no CSS custom properties, so the dust color falls
// back to a constant like in other scene-graph tests.
vi.mock("../../ui/lib/cssUtils", () => ({
  getCssColorValue: () => "#00ff00",
}));

// `useReducedMotion` reads a live media query; stub it so tests control the
// reduced-motion branch directly.
vi.mock("../../../core/hooks/useReducedMotion", () => ({
  useReducedMotion: vi.fn(() => false),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const setLevelDefaults = () => {
  useLevelStore.setState({
    gridSize: 20,
    gridOffset: 0,
    isLevelConfigLoaded: true,
    pathWaypoints: [],
  });
  useGameStore.setState({
    tileSize: 1,
    pathYOffset: 0.05,
    gameStatus: "playing",
    isPageVisible: true,
  });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
};

const createDust = async (): Promise<Renderer> => {
  setLevelDefaults();
  return await ReactThreeTestRenderer.create(
    <SimulationClockProvider>
      <AmbientDust />
    </SimulationClockProvider>
  );
};

const getPoints = (renderer: Renderer): Points => {
  const points = renderer.scene
    .findAll((node) => node.type === "Points")
    .map((node) => node.instance as Points);
  if (points.length !== 1)
    throw new Error(`expected one Points, found ${points.length}`);
  return points[0];
};

const sample = (arr: Float32Array, i: number): [number, number, number] => [
  arr[i * 3],
  arr[i * 3 + 1],
  arr[i * 3 + 2],
];

describe("AmbientDust", () => {
  it("renders a single Points cloud within the expected size range", async () => {
    const renderer = await createDust();

    try {
      const points = getPoints(renderer);
      const count = (points.geometry.attributes.position as {
        count: number;
      }).count;
      expect(points.name).toBe("ambient-dust");
      expect(count).toBeGreaterThanOrEqual(300);
      expect(count).toBeLessThanOrEqual(500);

      const material = points.material as PointsMaterial;
      expect(material.blending).toBe(AdditiveBlending);
      expect(material.depthWrite).toBe(false);
      expect(material.toneMapped).toBe(false);
    } finally {
      await renderer.unmount();
    }
  });

  it("never intercepts scene raycasts", async () => {
    const renderer = await createDust();

    try {
      const points = getPoints(renderer);
      const hits: unknown[] = [];
      points.raycast(
        new Ray(),
        () => {
          hits.push("hit");
        }
      );
      expect(hits).toHaveLength(0);
    } finally {
      await renderer.unmount();
    }
  });

  it("drifts the points while the world runs and freezes when paused", async () => {
    const renderer = await createDust();

    try {
      const points = getPoints(renderer);
      const arr = points.geometry.attributes.position.array as Float32Array;
      const start = sample(arr, 0);

      // A playing world moves the first point after a few frames.
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(30, 0.016);
      });
      const moved = sample(arr, 0);
      const distance = Math.hypot(
        moved[0] - start[0],
        moved[1] - start[1],
        moved[2] - start[2]
      );
      expect(distance).toBeGreaterThan(0.01);

      // Pause the world. The time scale eases to 0 over ~200ms, so let the
      // ramp finish before sampling (30 frames x 0.016s is the full ramp).
      await ReactThreeTestRenderer.act(async () => {
        useGameStore.getState().setGameStatus("paused");
      });
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(30, 0.016);
      });
      const frozen = sample(arr, 0);

      for (let i = 0; i < 10; i += 1) {
        await ReactThreeTestRenderer.act(async () => {
          await renderer.advanceFrames(1, 0.016);
        });
      }
      const after = sample(arr, 0);
      const drift = Math.hypot(
        after[0] - frozen[0],
        after[1] - frozen[1],
        after[2] - frozen[2]
      );
      expect(drift).toBeLessThan(1e-4);
    } finally {
      await renderer.unmount();
    }
  });

  it("keeps points within the field bounds as they wrap around", async () => {
    const renderer = await createDust();

    try {
      const points = getPoints(renderer);
      const arr = points.geometry.attributes.position.array as Float32Array;
      const count = (points.geometry.attributes.position as {
        count: number;
      }).count;

      // ~60s of drifting is enough for every point to cross at least one
      // field edge and wrap (max speed 0.6 u/s, field half-width 10).
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(3750, 0.016);
      });

      // 20 tiles x 1 unit / 2, plus a margin for the surface curvature
      // overhang at the board's edge (a speck lifted above the surface near
      // the rim sits slightly outside the rim in x/z).
      const bound = 10.2;
      for (let i = 0; i < count; i += 1) {
        const [x, y, z] = sample(arr, i);
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(
          true
        );
        expect(Math.abs(x)).toBeLessThanOrEqual(bound);
        expect(Math.abs(z)).toBeLessThanOrEqual(bound);
        expect(y).toBeGreaterThan(0);
      }
    } finally {
      await renderer.unmount();
    }
  });

  it("only wraps points at the field edges (no mid-field teleports)", async () => {
    const renderer = await createDust();

    try {
      const points = getPoints(renderer);
      const arr = points.geometry.attributes.position.array as Float32Array;
      const count = (points.geometry.attributes.position as {
        count: number;
      }).count;

      // A point only moves ~speed*step (<0.01 units) per frame. A large
      // per-frame displacement means the point teleported. Under the fix a
      // teleport is always a field-edge wrap (a point crossing a boundary
      // and re-entering the opposite edge), so one of its coordinates is at
      // the field edge (~half = 10). The pre-fix bug (mod on the drift
      // distance) teleported diagonal points back to their *start position
      // mid-field*, with no coordinate near an edge — this test catches that.
      //
      // The s-reset fires once per point within ~17-33s (field width /
      // speed), so run ~40s to be sure every point hits its reset.
      const STEP = 0.016;
      const edgeTol = 8.5; // a coordinate this close to the field edge counts as "at an edge"
      const teleportThreshold = 1.0; // well above the ~0.01/frame drift
      const framesNeeded = 2500; // ~40s

      let prev = Array.from(arr.slice(0, count * 3));
      for (let f = 0; f < framesNeeded; f += 1) {
        await ReactThreeTestRenderer.act(async () => {
          await renderer.advanceFrames(1, STEP);
        });
        for (let i = 0; i < count; i += 1) {
          const bx = prev[i * 3];
          const by = prev[i * 3 + 1];
          const bz = prev[i * 3 + 2];
          const ax = arr[i * 3];
          const ay = arr[i * 3 + 1];
          const az = arr[i * 3 + 2];
          const d = Math.hypot(ax - bx, ay - by, az - bz);
          if (d > teleportThreshold) {
            const atEdge =
              Math.abs(ax) > edgeTol ||
              Math.abs(az) > edgeTol ||
              Math.abs(bx) > edgeTol ||
              Math.abs(bz) > edgeTol;
            expect(
              atEdge,
              `point ${i} teleported mid-field (d=${d.toFixed(2)}) at t=${(
                (f + 1) * STEP
              ).toFixed(2)}s from (${bx.toFixed(1)},${by.toFixed(1)},${bz.toFixed(
                1
              )}) to (${ax.toFixed(1)},${ay.toFixed(1)},${az.toFixed(1)})`
            ).toBe(true);
          }
        }
        prev = Array.from(arr.slice(0, count * 3));
      }
    } finally {
      await renderer.unmount();
    }
  });

  it("renders nothing under prefers-reduced-motion", async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);

    try {
      const renderer = await createDust();
      try {
        expect(
          renderer.scene.findAll((node) => node.type === "Points")
        ).toHaveLength(0);
      } finally {
        await renderer.unmount();
      }
    } finally {
      vi.mocked(useReducedMotion).mockReturnValue(false);
    }
  });
});
