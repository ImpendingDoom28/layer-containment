import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useThree } from "@react-three/fiber";

import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useSettingsStore } from "../../../core/stores/useSettingsStore";
import {
  flatFieldToSphereOverlayPlanePose,
  getPlanetRadius,
} from "../../../utils/planetSurfaceMapping";
import { DeniedPlacementRippleFX } from "./DeniedPlacementRippleFX";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let reducedMotion = false;
vi.mock("../../../core/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reducedMotion,
}));

// The scene's red is a CSS custom property; the tests run without a styled
// document, so the FX falls back to a hard-coded red.
vi.mock("../../ui/lib/cssUtils", () => ({
  getCssColorValue: vi.fn(() => ""),
}));

// The test renderer runs in frameloop "never" mode and never advances the
// THREE clock, so the test drives raw elapsed time by writing to the scene
// clock directly before each frame (with the clock unpaused, the simulation
// time equals the raw time and the time scale is 1).
let sceneClock: { elapsedTime: number };

const ClockCapture = () => {
  const clock = useThree((s) => s.clock) as unknown as { elapsedTime: number };
  sceneClock = clock;
  return null;
};

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const TILE_SIZE = 1;
const GRID_SIZE = 8;
const PLANET_RADIUS = getPlanetRadius(GRID_SIZE, TILE_SIZE);
// The tile (3, 3)'s real surface pose, so the placement assertions are
// meaningful (an identity pose would pass trivially).
const POSE = flatFieldToSphereOverlayPlanePose(
  -(GRID_SIZE * TILE_SIZE) / 2 + 3 + TILE_SIZE / 2,
  -(GRID_SIZE * TILE_SIZE) / 2 + 3 + TILE_SIZE / 2,
  PLANET_RADIUS,
  0
);

const createHarness = async (
  props: {
    tileSize?: number;
    onComplete?: () => void;
  } = {}
) => {
  const { tileSize = TILE_SIZE, onComplete } = props;
  const renderer = await ReactThreeTestRenderer.create(
    <SimulationClockProvider>
      <ClockCapture />
      <DeniedPlacementRippleFX
        position={[POSE.position.x, POSE.position.y, POSE.position.z]}
        quaternion={POSE.quaternion}
        tileSize={tileSize}
        onComplete={onComplete}
      />
    </SimulationClockProvider>
  );
  return { renderer };
};

const advanceFrame = async (renderer: Renderer, rawTime: number) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime = rawTime;
    await renderer.advanceFrames(1, 1);
  });
};

// The scene graph objects come from RTTR's own three instance (a different
// module copy than this file's), so `instanceof` against this file's `three`
// never matches — match by the `.type` string and plain properties instead.
type SceneObject = {
  type: string;
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  geometry: { parameters?: { width: number; height: number } };
  material: {
    opacity: number;
    blending: number;
    transparent: boolean;
    depthWrite: boolean;
    side: number;
    uniforms: Record<string, { value: number | unknown }>;
  };
  traverse?: (fn: (o: SceneObject) => void) => void;
  children: SceneObject[];
};

const findGroup = (renderer: Renderer): SceneObject => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const found = scene.children.find((c) => c.type === "Group");
  expect(found).toBeDefined();
  return found!;
};

const findPlane = (renderer: Renderer): SceneObject => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const found: SceneObject[] = [];
  scene.traverse?.((o) => {
    if (o.type === "Mesh") found.push(o);
  });
  expect(found.length).toBe(1);
  return found[0];
};

beforeEach(() => {
  reducedMotion = false;
  useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
});

afterEach(() => {
  reducedMotion = false;
});

describe("DeniedPlacementRippleFX", () => {
  it("places the ripple plane on the tile, oriented to the surface pose", async () => {
    const { renderer } = await createHarness();
    try {
      const group = findGroup(renderer);
      expect(group.position.x).toBeCloseTo(POSE.position.x, 5);
      expect(group.position.y).toBeCloseTo(POSE.position.y, 5);
      expect(group.position.z).toBeCloseTo(POSE.position.z, 5);
      expect(group.quaternion.x).toBeCloseTo(POSE.quaternion.x, 5);
      expect(group.quaternion.y).toBeCloseTo(POSE.quaternion.y, 5);
      expect(group.quaternion.z).toBeCloseTo(POSE.quaternion.z, 5);
      expect(group.quaternion.w).toBeCloseTo(POSE.quaternion.w, 5);

      // The plane spans the ripple radius (1.3 × tile) on each axis.
      const plane = findPlane(renderer);
      expect(plane.geometry.parameters?.width).toBeCloseTo(2 * 1.3 * TILE_SIZE, 5);
      expect(plane.geometry.parameters?.height).toBeCloseTo(2 * 1.3 * TILE_SIZE, 5);
    } finally {
      renderer.unmount();
    }
  });

  it("starts invisible and runs the ripple to completion once", async () => {
    const { renderer } = await createHarness();
    try {
      const plane = findPlane(renderer);
      // Idle before the first frame: nothing is drawn (no full-size flash).
      expect(plane.material.uniforms["uOpacity"].value).toBe(0);

      // Establish the effect's start time, then partway through the ripple
      // the progress has advanced and the plane is live.
      await advanceFrame(renderer, 0.01);
      expect(plane.material.uniforms["uProgress"].value).toBeGreaterThanOrEqual(0);
      expect(plane.material.uniforms["uOpacity"].value).toBe(1);

      await advanceFrame(renderer, 0.3);
      expect(plane.material.uniforms["uProgress"].value).toBeGreaterThan(0.3);
      expect(plane.material.uniforms["uProgress"].value).toBeLessThan(1);

      // Past the 0.5 s duration it is fully done and hidden again.
      await advanceFrame(renderer, 1.0);
      expect(plane.material.uniforms["uProgress"].value).toBe(1);
      expect(plane.material.uniforms["uOpacity"].value).toBe(0);
    } finally {
      renderer.unmount();
    }
  });

  it("renders the ripple additively (glowing, ground shows through)", async () => {
    const { renderer } = await createHarness();
    try {
      const plane = findPlane(renderer);
      expect(plane.material.blending).toBe(2); // THREE.AdditiveBlending
      expect(plane.material.transparent).toBe(true);
      expect(plane.material.depthWrite).toBe(false);
      expect(plane.material.side).toBe(2); // THREE.DoubleSide
    } finally {
      renderer.unmount();
    }
  });

  it("invokes onComplete exactly once when the ripple finishes", async () => {
    let completed = 0;
    const { renderer } = await createHarness({
      onComplete: () => {
        completed += 1;
      },
    });
    try {
      await advanceFrame(renderer, 0.1);
      expect(completed).toBe(0);

      await advanceFrame(renderer, 0.6);
      expect(completed).toBe(1);

      // No further completions after it has already fired.
      await advanceFrame(renderer, 1.2);
      expect(completed).toBe(1);
    } finally {
      renderer.unmount();
    }
  });

  it("holds a static mid-dissolve pose under prefers-reduced-motion", async () => {
    let completed = 0;
    reducedMotion = true;
    const { renderer } = await createHarness({
      onComplete: () => {
        completed += 1;
      },
    });
    try {
      const plane = findPlane(renderer);
      // Nothing animates: the X shows at a mid-dissolve progress.
      await advanceFrame(renderer, 0.01);
      expect(plane.material.uniforms["uProgress"].value).toBeCloseTo(0.45, 5);
      expect(plane.material.uniforms["uOpacity"].value).toBe(1);

      // After the hold (0.8 s) the static pose fades out and the effect
      // finishes, so the plane unmounts like the animated one.
      await advanceFrame(renderer, 0.9);
      expect(plane.material.uniforms["uProgress"].value).toBeCloseTo(0.45, 5);
      expect(plane.material.uniforms["uOpacity"].value).toBe(0);
      expect(completed).toBe(1);
    } finally {
      renderer.unmount();
    }
  });
});
