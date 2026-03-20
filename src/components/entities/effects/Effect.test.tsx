import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Mesh } from "three";
import { describe, expect, it } from "vitest";

import { Effect } from "./Effect";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const AnimatedMesh = () => {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial />
    </mesh>
  );
};

describe("Effect", () => {
  it("renders the ring meshes inside the effect group", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <Effect position={[1, 2, 3]} color="#00ff88" />
    );

    try {
      const effectGroup = renderer.scene.findByType("Group");
      const ringMeshes = renderer.scene.findAll(
        (instance) => instance.type === "Mesh"
      );

      expect(effectGroup.props.position).toEqual([1, 2, 3]);
      expect(ringMeshes).toHaveLength(2);
    } finally {
      renderer.unmount();
    }
  });

  it("advances frame subscribers with RTTR", async () => {
    const renderer = await ReactThreeTestRenderer.create(<AnimatedMesh />);

    try {
      const mesh = renderer.scene.findByType("Mesh").instance as Mesh;

      expect(mesh.rotation.x).toBe(0);

      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(2, 1);
      });

      expect(mesh.rotation.x).toBeCloseTo(2);
    } finally {
      renderer.unmount();
    }
  });
});
