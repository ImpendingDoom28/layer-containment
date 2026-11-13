import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import {
  AdditiveBlending,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from "three";

import { RangeFadeWall } from "./RangeFadeWall";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const getMesh = (renderer: Renderer): Mesh =>
  (
    renderer.scene
      .findAll((instance) => instance.type === "Mesh")
      .map((entry) => entry.instance) as unknown as Mesh[]
  )[0];

const getGroup = (mesh: Mesh): Group => mesh.parent as Group;

describe("RangeFadeWall", () => {
  it("builds one fading quad per strip, with the strip count tracking the range", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RangeFadeWall range={3} />
    );

    try {
      const mesh = getMesh(renderer);
      const geometry = mesh.geometry;
      const position = geometry.getAttribute("position");
      const color = geometry.getAttribute("color");
      // A 3-unit ring gets 9 strips (the count tracks the range, clamped),
      // each strip one quad: 4 vertices and 6 indices.
      expect(position.count).toBe(36);
      expect(color.count).toBe(36);
      expect(geometry.index!.count).toBe(54);

      const stripCount = position.count / 4;
      for (let strip = 0; strip < stripCount; strip++) {
        const base = strip * 4;
        // Base vertices: white and solid (the strip's opacity, in 0.3–0.8),
        // standing on the ring line — y = 0, radius ≈ the range.
        for (const vertex of [base, base + 1]) {
          expect(color.getX(vertex)).toBe(1);
          expect(color.getY(vertex)).toBe(1);
          expect(color.getZ(vertex)).toBe(1);
          expect(color.getW(vertex)).toBeGreaterThan(0.25);
          expect(color.getW(vertex)).toBeLessThan(0.81);
          expect(position.getY(vertex)).toBeCloseTo(0);
          const radius = Math.hypot(
            position.getX(vertex),
            position.getZ(vertex)
          );
          expect(radius).toBeGreaterThan(3 - 0.06);
          expect(radius).toBeLessThan(3 + 0.06);
        }
        // Top vertices: the fade — fully transparent, lifted above the base.
        for (const vertex of [base + 2, base + 3]) {
          expect(color.getW(vertex)).toBe(0);
        }
        expect(position.getY(base + 2)).toBeGreaterThan(0);
        expect(position.getY(base + 3)).toBeGreaterThan(0);
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
      const meshA = getMesh(a);
      const meshB = getMesh(b);
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
      const group = getGroup(meshA);
      expect(group.position.x).toBeCloseTo(1);
      expect(group.position.y).toBeCloseTo(2);
      expect(group.position.z).toBeCloseTo(3);
    } finally {
      a.unmount();
      b.unmount();
    }
  });
});
