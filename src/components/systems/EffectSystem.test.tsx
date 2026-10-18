import ReactThreeTestRenderer from "@react-three/test-renderer";
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

import { WorldProvider } from "koota/react";

import { effectActions } from "../../core/ecs/actions/effectActions";
import { IsEffect } from "../../core/ecs/traits/effect";
import { testWorld } from "../../core/ecs/world";
import { EffectSystem } from "./EffectSystem";

type CapturedEffect = {
  position?: [number, number, number];
  color?: string;
  duration?: number;
  onComplete?: () => void;
};

// Capture the props EffectSystem passes to each <Effect> so we can assert the
// data wiring and drive completion, without depending on the RTTR clock
// (its `elapsedTime` does not advance, so a real <Effect> never finishes here).
const captured: CapturedEffect[] = vi.hoisted(() => []);

vi.mock("../entities/effects/Effect", () => ({
  Effect: (props: CapturedEffect) => {
    captured.push(props);
    return <group position={props.position ?? [0, 0, 0]} />;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const clearEffects = () => {
  for (const entity of [...testWorld.query(IsEffect)]) {
    entity.destroy();
  }
};

describe("EffectSystem", () => {
  beforeEach(() => {
    clearEffects();
    captured.length = 0;
  });

  afterEach(() => {
    clearEffects();
  });

  it("renders an Effect per active entity with its data", async () => {
    effectActions(testWorld).spawnEffect([0, 1, 0], "#f00", "spawn");
    effectActions(testWorld).spawnEffect([0, 2, 0], "#0f0", "end");

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EffectSystem />
      </WorldProvider>
    );

    try {
      const spawn = captured.find((c) => c.position?.[1] === 1);
      expect(spawn).toMatchObject({ color: "#f00", duration: 0.4 });

      const end = captured.find((c) => c.position?.[1] === 2);
      expect(end).toMatchObject({ color: "#0f0", duration: 0.5 });
    } finally {
      renderer.unmount();
    }
  });

  it("destroys the entity once its Effect reports completion", async () => {
    const entity = effectActions(testWorld).spawnEffect([0, 1, 0], "#f00", "spawn");

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EffectSystem />
      </WorldProvider>
    );

    try {
      expect(testWorld.queryFirst(IsEffect)).toBeDefined();

      const props = captured.find((c) => c.position?.[1] === 1);
      expect(props?.onComplete).toBeTypeOf("function");

      await ReactThreeTestRenderer.act(async () => {
        props!.onComplete!();
      });

      expect(entity.isAlive()).toBe(false);
      expect(testWorld.queryFirst(IsEffect)).toBeUndefined();
    } finally {
      renderer.unmount();
    }
  });

  it("sweeps active effect entities on unmount so a later scene renders none", async () => {
    const entity = effectActions(testWorld).spawnEffect([0, 1, 0], "#f00", "spawn");

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EffectSystem />
      </WorldProvider>
    );

    expect(testWorld.queryFirst(IsEffect)).toBeDefined();

    // `Effect` only settles via `useFrame`, so a scene transition can leave the
    // entity alive; the unmount cleanup must destroy it.
    await ReactThreeTestRenderer.act(async () => {
      renderer.unmount();
    });

    expect(entity.isAlive()).toBe(false);
    expect(testWorld.queryFirst(IsEffect)).toBeUndefined();
  });
});
