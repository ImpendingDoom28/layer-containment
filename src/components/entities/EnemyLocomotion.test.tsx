import { useRef } from "react";
import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, Object3D } from "three";
import type { Entity } from "koota";

import { SimulationClockProvider } from "../../core/contexts/SimulationClockContext";
import { EnemyMotion } from "../../core/ecs/traits/enemy";
import { EnemyLocomotion as EnemyLocomotionTrait } from "../../core/ecs/traits/locomotion";
import { testWorld } from "../../core/ecs/world";
import { useGameStore } from "../../core/stores/useGameStore";
import { useSettingsStore } from "../../core/stores/useSettingsStore";
import { EnemyLocomotion } from "./EnemyLocomotion";

let reducedMotion = false;
vi.mock("../../core/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reducedMotion,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;
let sceneClock: { elapsedTime: number };

const ClockCapture = () => {
  const clock = useThree((state) => state.clock) as unknown as {
    elapsedTime: number;
  };
  sceneClock = clock;
  return null;
};

const makeModel = () => {
  const model = new Group();
  const leftLeg = new Object3D();
  const rightLeg = new Object3D();
  leftLeg.name = "Leg_L";
  rightLeg.name = "Leg_R";
  model.add(leftLeg, rightLeg);
  return { model, leftLeg, rightLeg };
};

const makeEntity = (): Entity =>
  testWorld.spawn(
    EnemyMotion,
    EnemyLocomotionTrait({
      phase: 0,
      walkAmplitude: 0.55,
      walkFrequency: 9.5,
    })
  );

type HarnessProps = {
  entity: Entity;
  model: Group;
};

const Harness = ({ entity, model }: HarnessProps) => {
  const modelRef = useRef<Object3D | null>(model);
  return (
    <SimulationClockProvider>
      <ClockCapture />
      <EnemyLocomotion entity={entity} modelRef={modelRef}>
        <primitive object={model} />
      </EnemyLocomotion>
    </SimulationClockProvider>
  );
};

const advanceFrame = async (renderer: Renderer, time: number) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime = time;
    await renderer.advanceFrames(1, 1);
  });
};

afterEach(() => {
  reducedMotion = false;
  useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
});

describe("EnemyLocomotion walking", () => {
  it("advances opposed leg swings and freezes them on pause", async () => {
    useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
    useSettingsStore.setState({ pauseWhenTabHidden: false });
    const entity = makeEntity();
    const { model, leftLeg, rightLeg } = makeModel();
    const renderer = await ReactThreeTestRenderer.create(
      <Harness entity={entity} model={model} />
    );

    try {
      await advanceFrame(renderer, 0);
      expect(leftLeg.rotation.x).toBe(0);
      expect(rightLeg.rotation.x).toBe(0);

      await advanceFrame(renderer, 0.1);
      expect(leftLeg.rotation.x).toBeGreaterThan(0);
      expect(rightLeg.rotation.x).toBe(-leftLeg.rotation.x);

      await ReactThreeTestRenderer.act(async () => {
        useGameStore.setState({ gameStatus: "paused" });
      });
      await advanceFrame(renderer, 0.2);
      const pausedPitch = leftLeg.rotation.x;
      await advanceFrame(renderer, 0.4);
      // The pause clock's `now - (now - segmentStart)` fold can differ by a
      // float ULP between two raw times, so compare with a tight tolerance —
      // still far tighter than any visible motion.
      expect(leftLeg.rotation.x).toBeCloseTo(pausedPitch, 12);
      expect(rightLeg.rotation.x).toBeCloseTo(-pausedPitch, 12);
    } finally {
      await renderer.unmount();
      entity.destroy();
    }
  });

  it("restores both leg rest poses under reduced motion", async () => {
    const entity = makeEntity();
    const { model, leftLeg, rightLeg } = makeModel();
    const renderer = await ReactThreeTestRenderer.create(
      <Harness entity={entity} model={model} />
    );

    try {
      await advanceFrame(renderer, 0.1);
      expect(leftLeg.rotation.x).not.toBe(0);

      reducedMotion = true;
      await ReactThreeTestRenderer.act(async () => {
        renderer.update(<Harness entity={entity} model={model} />);
      });
      await advanceFrame(renderer, 0.2);

      expect(leftLeg.rotation.x).toBe(0);
      expect(rightLeg.rotation.x).toBe(0);
    } finally {
      await renderer.unmount();
      entity.destroy();
    }
  });
});
