import { createRef } from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import type { Sprite } from "three";

import { FloatingTexts, type FloatingTextsHandle } from "./FloatingTexts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const advance = async (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
  count: number,
  delta: number
) => {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(count, delta);
  });
};

const getSprites = (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
): Sprite[] =>
  renderer.scene
    .findAll((instance) => instance.type === "Sprite")
    .map((entry) => entry.instance as Sprite);

describe("FloatingTexts", () => {
  it("spawns a Sprite that rises, fades out, and recycles", async () => {
    const ref = createRef<FloatingTextsHandle>();
    const renderer = await ReactThreeTestRenderer.create(
      <FloatingTexts ref={ref} shouldStopMovement={false} />
    );

    try {
      const sprites = getSprites(renderer);
      expect(sprites.length).toBeGreaterThan(0);
      expect(sprites.every((sprite) => !sprite.visible)).toBe(true);

      await advance(renderer, 1, 0);

      ref.current?.spawn("20", [1, 2, 3], "#ffffff");
      const [spawned] = sprites.filter((sprite) => sprite.visible);
      expect(spawned).toBeDefined();
      expect(spawned.position.y).toBe(2);
      expect((spawned.material as { opacity: number }).opacity).toBe(1);

      // After a fraction of the lifetime the Sprite has risen and faded in.
      await advance(renderer, 1, 0.3);
      expect(spawned.position.y).toBeGreaterThan(2);
      expect((spawned.material as { opacity: number }).opacity).toBeLessThan(1);

      // After the full lifetime it is hidden and its slot is reusable.
      await advance(renderer, 10, 0.2);
      expect(spawned.visible).toBe(false);
      expect((spawned.material as { opacity: number }).opacity).toBe(0);
    } finally {
      renderer.unmount();
    }
  });

  it("reuses a recycled slot when the pool is exhausted", async () => {
    const ref = createRef<FloatingTextsHandle>();
    const renderer = await ReactThreeTestRenderer.create(
      <FloatingTexts ref={ref} shouldStopMovement={false} />
    );

    try {
      await advance(renderer, 1, 0);
      const poolSize = getSprites(renderer).length;

      // Exhaust the pool with one spawn per slot.
      for (let i = 0; i < poolSize; i++) {
        ref.current?.spawn(String(i), [i, 0, 0], "#ffffff");
      }
      expect(
        getSprites(renderer).filter((sprite) => sprite.visible).length
      ).toBe(poolSize);

      // Let the pool expire so all slots are free again.
      await advance(renderer, 10, 0.2);
      expect(
        getSprites(renderer).filter((sprite) => sprite.visible).length
      ).toBe(0);

      // A fresh spawn reuses the recycled slot.
      ref.current?.spawn("99", [5, 5, 5], "#ffffff");
      expect(
        getSprites(renderer).filter((sprite) => sprite.visible).length
      ).toBe(1);
    } finally {
      renderer.unmount();
    }
  });
});
