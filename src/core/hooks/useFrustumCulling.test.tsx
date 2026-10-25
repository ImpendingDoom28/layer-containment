import { useRef, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import type { Group, Mesh, PerspectiveCamera } from "three";

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

// A culled group whose child mesh scale is driven from outside, standing in
// for an effect that grows over its lifetime (e.g. a heal ring scaling up)
// without adding a child to the group.
const ScaledCulledGroup = ({
  position,
  meshRef,
}: {
  position: [number, number, number];
  meshRef: RefObject<Mesh | null>;
}) => {
  const groupRef = useRef<Group>(null);
  useFrustumCulling(groupRef);
  return (
    <group ref={groupRef} position={position}>
      <mesh ref={meshRef}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
};

const renderScaled = async (
  position: [number, number, number],
  meshRef: RefObject<Mesh | null>
) => {
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <CameraProbe />
      <ScaledCulledGroup position={position} meshRef={meshRef} />
    </>
  );
  const group = renderer.scene.findByType("Group");
  return { renderer, group: group.instance as Group };
};

const renderTwo = async (
  first: [number, number, number],
  second: [number, number, number]
) => {
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <CameraProbe />
      <CulledGroup position={first} />
      <CulledGroup position={second} />
    </>
  );
  const groups = renderer.scene
    .findAllByType("Group")
    .map((g) => g.instance as Group);
  return { renderer, first: groups[0], second: groups[1] };
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

  it("culls every group, not just the first hook to run each frame", async () => {
    // Regression: only the first hook rebuilt its margin-expanded hide
    // frustum on a camera change; the rest kept the default `new Frustum()`
    // and their grace band never matched the real view, so they were never
    // hidden. Both groups must be culled independently.
    const { renderer, first, second } = await renderTwo(
      [0, 0, -10],
      [0, 0, 20]
    );

    try {
      expect(first.visible).toBe(true);
      expect(second.visible).toBe(true);

      await frame(renderer);

      expect(first.visible).toBe(true);
      expect(second.visible).toBe(false);
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

  it("re-measures the radius when a descendant scales up (heal-ring case)", async () => {
    // Regression: the radius was only re-measured when the child *set*
    // changed. A heal ring scales from 1x up to its configured radius
    // without adding a child, so a stale undersized sphere let the group
    // hide while the expanded effect was still in view.
    const meshRef = { current: null as Mesh | null };
    const { renderer, group } = await renderScaled([0, 0, 20], meshRef);

    try {
      await frame(renderer);
      expect(group.visible).toBe(false);

      // Scale the effect up by 20x: the sphere grows to ~17.3 units, far
      // past the 15 units back to the camera's near plane, so the group must
      // reappear instead of staying hidden on a stale 0.866 radius.
      meshRef.current!.scale.set(20, 20, 20);
      await frame(renderer, 2);
      expect(group.visible).toBe(true);
    } finally {
      await renderer.unmount();
    }
  });
});
