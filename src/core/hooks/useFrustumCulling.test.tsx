import { useRef } from "react";
import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import type { Group, PerspectiveCamera } from "three";

import { useFrustumCulling } from "./useFrustumCulling";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The test renderer's default camera sits at (0, 0, 5) looking down -Z, so
// the view contains -Z in front and +Z behind the camera.
let testCamera: PerspectiveCamera | null = null;

const CameraProbe = () => {
  testCamera = useThree((state) => state.camera) as PerspectiveCamera;
  return null;
};

const CulledGroup = ({ position }: { position: [number, number, number] }) => {
  const groupRef = useRef<Group>(null);
  useFrustumCulling(groupRef);
  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
};

const render = async (position: [number, number, number]) => {
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <CameraProbe />
      <CulledGroup position={position} />
    </>
  );
  const group = renderer.scene.findByType("Group");
  return { renderer, group: group.instance as Group };
};

const frame = async (renderer: Awaited<ReturnType<typeof render>>["renderer"], n = 1) => {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(n);
  });
};

describe("useFrustumCulling", () => {
  it("keeps a group in front of the camera visible", async () => {
    const { renderer, group } = await render([0, 0, -10]);

    try {
      await frame(renderer);

      expect(group.visible).toBe(true);
    } finally {
      await renderer.unmount();
    }
  });

  it("hides a group behind the camera without unmounting it", async () => {
    const { renderer, group } = await render([0, 0, 20]);

    try {
      expect(group.visible).toBe(true);

      await frame(renderer);

      expect(group.visible).toBe(false);
      // Only `visible` is toggled; the child mesh stays mounted.
      expect(group.children).toHaveLength(1);
    } finally {
      await renderer.unmount();
    }
  });

  it("rebuilds the frustum when the camera moves", async () => {
    const { renderer, group } = await render([0, 0, -10]);

    try {
      await frame(renderer);
      expect(group.visible).toBe(true);

      testCamera!.position.set(50, 0, 5);
      testCamera!.updateMatrixWorld();
      await frame(renderer);
      expect(group.visible).toBe(false);

      testCamera!.position.set(0, 0, 5);
      testCamera!.updateMatrixWorld();
      await frame(renderer);
      expect(group.visible).toBe(true);
    } finally {
      await renderer.unmount();
    }
  });

  it("does not re-hide a culled group while the camera is idle", async () => {
    const { renderer, group } = await render([0, 0, 20]);

    try {
      await frame(renderer);
      expect(group.visible).toBe(false);

      // Idle frames must not touch visibility or re-run the matrix math.
      await frame(renderer, 5);
      expect(group.visible).toBe(false);
    } finally {
      await renderer.unmount();
    }
  });
});
