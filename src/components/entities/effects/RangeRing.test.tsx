import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import type { Mesh, RingGeometry } from "three";

import { RangeRing } from "./RangeRing";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const getRingGeometry = (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
): RingGeometry => {
  const mesh = (renderer.scene
    .findAll((instance) => instance.type === "Mesh")
    .map((entry) => entry.instance) as unknown as Mesh[])[0];
  return mesh.geometry as RingGeometry;
};

describe("RangeRing", () => {
  it("renders a ring with the expected radius and segment count", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RangeRing range={4} color="#ffffff" />
    );

    try {
      const { parameters } = getRingGeometry(renderer);
      expect(parameters.innerRadius).toBeCloseTo(3.6);
      expect(parameters.outerRadius).toBeCloseTo(4);
      expect(parameters.thetaSegments).toBe(32);
    } finally {
      renderer.unmount();
    }
  });

  it("honors custom radius fraction, segments, opacity and position", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RangeRing
        range={3}
        color="#ff0000"
        position={[1, 2, 3]}
        innerRadiusFraction={0.94}
        radialSegments={48}
        opacity={0.45}
      />
    );

    try {
      const mesh = (renderer.scene
        .findAll((instance) => instance.type === "Mesh")
        .map((entry) => entry.instance) as unknown as Mesh[])[0];
      const { parameters } = mesh.geometry as RingGeometry;
      expect(parameters.innerRadius).toBeCloseTo(2.82);
      expect(parameters.outerRadius).toBeCloseTo(3);
      expect(parameters.thetaSegments).toBe(48);
      expect(mesh.position.x).toBeCloseTo(1);
      expect(mesh.position.y).toBeCloseTo(2);
      expect(mesh.position.z).toBeCloseTo(3);
      expect((mesh.material as { opacity: number }).opacity).toBe(0.45);
    } finally {
      renderer.unmount();
    }
  });
});
