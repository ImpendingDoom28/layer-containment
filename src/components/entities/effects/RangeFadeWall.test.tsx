import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useThree } from "@react-three/fiber";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AdditiveBlending,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from "three";

import { RangeFadeWall, RangeFadeWallPrewarm } from "./RangeFadeWall";
import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useSettingsStore } from "../../../core/stores/useSettingsStore";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const getWallMesh = (renderer: Renderer): Mesh => {
  const meshes = renderer.scene
    .findAll((instance) => instance.type === "Mesh")
    .map((entry) => entry.instance) as unknown as Mesh[];
  // The wall mesh is the one on a visible group (the prewarm's is hidden).
  const visible = meshes.find(
    (mesh) => mesh.visible && mesh.parent?.visible !== false
  );
  return visible ?? meshes[0];
};

const wrap = (children: React.ReactElement) => (
  <SimulationClockProvider>{children}</SimulationClockProvider>
);

// The test renderer runs in frameloop "never" mode and never advances the
// THREE clock, so the test drives raw elapsed time by writing to the scene
// clock directly before each frame (with the clock unpaused, the simulation
// time equals the raw time).
let sceneClock: { elapsedTime: number };

const ClockCapture = () => {
  const clock = useThree((s) => s.clock) as unknown as { elapsedTime: number };
  sceneClock = clock;
  return null;
};

const advanceFrame = async (renderer: Renderer, rawTime: number) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime = rawTime;
    await renderer.advanceFrames(1, 1);
  });
};

describe("RangeFadeWall", () => {
  beforeEach(() => {
    useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
    useSettingsStore.setState({ pauseWhenTabHidden: false });
  });

  afterEach(() => {
    useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
    useSettingsStore.setState({ pauseWhenTabHidden: false });
  });

  it("builds one connected band of quads around the ring, with the resolution tracking the range", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      wrap(<RangeFadeWall range={3} />)
    );

    try {
      const mesh = getWallMesh(renderer);
      const geometry = mesh.geometry;
      const position = geometry.getAttribute("position") as {
        count: number;
        getX: (i: number) => number;
        getY: (i: number) => number;
        getZ: (i: number) => number;
      };
      const color = geometry.getAttribute("color") as {
        count: number;
        getW: (i: number) => number;
      };
      // A 3-unit ring gets 236 segments (the resolution tracks the
      // circumference, clamped 128–256); each segment is one quad: 4
      // vertices and 6 indices.
      expect(position.count).toBe(944);
      expect(color.count).toBe(944);
      expect(geometry.index!.count).toBe(1416);

      const segments = position.count / 4;
      for (let i = 0; i < segments; i += 1) {
        const base = i * 4;
        // Base vertices: white and solid (the band's alpha, in 0.38–0.56),
        // standing on the ring line (y = 0, radius exactly the range).
        for (const vertex of [base, base + 1]) {
          expect(color.getW(vertex)).toBeGreaterThanOrEqual(0.38);
          expect(color.getW(vertex)).toBeLessThanOrEqual(0.56);
          expect(position.getY(vertex)).toBeCloseTo(0);
          const radius = Math.hypot(
            position.getX(vertex),
            position.getZ(vertex)
          );
          expect(radius).toBeCloseTo(3);
        }
        // Top vertices: the fade — fully transparent, lifted above the base
        // (their Y is animated per frame; the initial value is the t = 0
        // swell at that edge, between the base and the max crest height).
        for (const vertex of [base + 2, base + 3]) {
          expect(color.getW(vertex)).toBe(0);
          expect(position.getY(vertex)).toBeGreaterThan(0);
          expect(position.getY(vertex)).toBeLessThanOrEqual(0.75 + 1e-6);
        }
      }
    } finally {
      renderer.unmount();
    }
  });

  it("flows the swell around the ring and freezes it on pause", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      wrap(
        <>
          <ClockCapture />
          <RangeFadeWall range={4} />
        </>
      )
    );

    try {
      const mesh = getWallMesh(renderer);
      const position = mesh.geometry.getAttribute("position") as {
        getY: (i: number) => number;
      };
      // The crest height of the first segment's top-left vertex.
      const crestY = () => position.getY(3);

      await advanceFrame(renderer, 0);
      const y0 = crestY();
      await advanceFrame(renderer, 2);
      const y2 = crestY();
      // Advancing the simulation clock moves the crest (the swell travels).
      expect(Math.abs(y2 - y0)).toBeGreaterThan(0.02);
      // The crest never exceeds the swell's max height.
      expect(y0).toBeLessThanOrEqual(0.75 + 1e-6);
      expect(y2).toBeLessThanOrEqual(0.75 + 1e-6);

      // Pausing the world freezes the crest.
      useGameStore.setState({ gameStatus: "paused" });
      await advanceFrame(renderer, 3);
      const y3 = crestY();
      await advanceFrame(renderer, 6);
      const y6 = crestY();
      expect(Math.abs(y6 - y3)).toBeLessThan(1e-6);
    } finally {
      renderer.unmount();
    }
  });

  it("reuses one geometry per range and a shared additive material", async () => {
    const a = await ReactThreeTestRenderer.create(
      wrap(<RangeFadeWall range={4} position={[1, 2, 3]} />)
    );
    const b = await ReactThreeTestRenderer.create(
      wrap(<RangeFadeWall range={4} />)
    );

    try {
      const meshA = getWallMesh(a);
      const meshB = getWallMesh(b);
      // Same range → the same cached geometry instance (no rebuild per wall).
      expect(meshA.geometry).toBe(meshB.geometry);

      const material = meshA.material as MeshBasicMaterial;
      expect(material.blending).toBe(AdditiveBlending);
      expect(material.vertexColors).toBe(true);
      expect(material.transparent).toBe(true);
      expect(material.color.getHexString()).toBe("ffffff");
      expect(material.depthWrite).toBe(false);

      // The placement transform lives on the wrapping group (the mesh itself
      // stays at the ring's local origin).
      const group = meshA.parent as Group;
      expect(group.position.x).toBeCloseTo(1);
      expect(group.position.y).toBeCloseTo(2);
      expect(group.position.z).toBeCloseTo(3);
    } finally {
      a.unmount();
      b.unmount();
    }
  });

  it("keeps a hidden prewarm quad with the wall's material (shader warm)", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RangeFadeWallPrewarm />
    );

    try {
      const meshes = renderer.scene
        .findAll((instance) => instance.type === "Mesh")
        .map((entry) => entry.instance) as unknown as Mesh[];
      expect(meshes).toHaveLength(1);
      // The prewarm's group is hidden (never drawn) but its material is the
      // shared wall material, so the additive + alpha-vertex-colour program is
      // in the scene graph for the ShaderReadyGate to compile.
      expect((meshes[0].parent as Group).visible).toBe(false);
      const material = meshes[0].material as MeshBasicMaterial;
      expect(material.blending).toBe(AdditiveBlending);
      expect(material.vertexColors).toBe(true);
    } finally {
      renderer.unmount();
    }
  });
});
