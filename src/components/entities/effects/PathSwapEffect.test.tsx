import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import type { Mesh } from "three";
import type { Entity } from "koota";
import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { PathSwapEffect } from "./PathSwapEffect";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

/** The live three.js object behind a RTTR scene node. */
const objectOf = (node: ReturnType<Renderer["scene"]["find"]>): unknown =>
  (node as unknown as { instance?: unknown; _fiber?: { stateNode?: unknown } })
    .instance ??
  (node as unknown as { _fiber?: { stateNode?: unknown } })._fiber?.stateNode;

const getMeshes = (renderer: Renderer): Mesh[] =>
  renderer.scene
    .findAll((node) => node.type === "Mesh")
    .map((node) => objectOf(node) as Mesh);

const countGeometry = (renderer: Renderer, type: string): number =>
  getMeshes(renderer).filter((mesh) => mesh.geometry.type === type).length;

// A stand-in Entity: the view reads the PathSwap trait each frame, so the test
// only needs `get`/`has` to report the trait. The render loop is not driven by
// the test renderer, so the initial JSX props are what is asserted.
const makeFakeEntity = (): Entity =>
  ({
    get: () => ({
      swaps: [{ atProgress: 0.36, targetPathIndex: 1 }],
      nextSwap: 0,
      telegraphReadyAt: 0,
      lastCrossAt: 0,
    }),
    has: () => true,
  }) as unknown as Entity;

describe("PathSwapEffect", () => {
  it("renders a wind-up double ring, an arrival burst, and rising particles", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SimulationClockProvider>
        <PathSwapEffect entity={makeFakeEntity()} enemySize={1.5} color="#ff4400" />
      </SimulationClockProvider>
    );

    try {
      // Four tori: the wind-up double ring (boss-colored) and the arrival
      // burst's two rings (boss + white).
      expect(countGeometry(renderer, "TorusGeometry")).toBe(4);
      // Six rising particles gather around the wind-up ring.
      expect(countGeometry(renderer, "SphereGeometry")).toBe(6);
    } finally {
      renderer.unmount();
    }
  });

  it("scales the ring with the enemy size", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SimulationClockProvider>
        <PathSwapEffect entity={makeFakeEntity()} enemySize={1.5} color="#ff4400" />
      </SimulationClockProvider>
    );

    try {
      const tori = getMeshes(renderer).filter(
        (mesh) => mesh.geometry.type === "TorusGeometry"
      );
      expect(tori.length).toBe(4);
      // The outer (wind-up/arrival) rings rest at RING_RADIUS * enemySize.
      const outerScales = tori
        .map((mesh) => mesh.scale.x)
        .filter((s) => s > 1)
        .sort((a, b) => b - a);
      expect(outerScales[0]).toBeCloseTo(1.3 * 1.5, 5);
    } finally {
      renderer.unmount();
    }
  });
});
