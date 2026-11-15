import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import {
  AdditiveBlending,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from "three";

import { RangeFadeWall, RangeFadeWallPrewarm } from "./RangeFadeWall";

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

describe("RangeFadeWall", () => {
  it("builds one fading quad per spike, with the spike count tracking the range", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RangeFadeWall range={3} />
    );

    try {
      const mesh = getWallMesh(renderer);
      const geometry = mesh.geometry;
      const position = geometry.getAttribute("position") as {
        count: number;
        getX: (i: number) => number;
        getY: (i: number) => number;
        getZ: (i: number) => number;
        getW: (i: number) => number;
      };
      const color = geometry.getAttribute("color") as {
        count: number;
        getW: (i: number) => number;
      };
      // A 3-unit ring gets 12 spikes (the count tracks the range, clamped),
      // each spike one quad: 4 vertices and 6 indices.
      expect(position.count).toBe(48);
      expect(color.count).toBe(48);
      expect(geometry.index!.count).toBe(72);

      const spikeCount = position.count / 4;
      for (let spike = 0; spike < spikeCount; spike += 1) {
        const base = spike * 4;
        // Base vertices: white and solid (the spike's opacity, in 0.3–0.75),
        // standing on the ring line (y = 0, radius ≈ the range).
        for (const vertex of [base, base + 1]) {
          expect(color.getW(vertex)).toBeGreaterThanOrEqual(0.3);
          expect(color.getW(vertex)).toBeLessThanOrEqual(0.75);
          expect(position.getY(vertex)).toBeCloseTo(0);
          const radius = Math.hypot(
            position.getX(vertex),
            position.getZ(vertex)
          );
          expect(radius).toBeGreaterThan(3 - 0.06);
          expect(radius).toBeLessThan(3 + 0.06);
        }
        // Top vertices: the fade — fully transparent, lifted above the base
        // (their Y is animated per frame; the initial value is the spike's
        // max height).
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

  it("reuses one geometry per range and a shared additive material", async () => {
    const a = await ReactThreeTestRenderer.create(
      <RangeFadeWall range={4} position={[1, 2, 3]} />
    );
    const b = await ReactThreeTestRenderer.create(<RangeFadeWall range={4} />);

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
