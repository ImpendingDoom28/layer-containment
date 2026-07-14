import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, vi } from "vitest";

import { ShaderReadyGate } from "./ShaderReadyGate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const advanceUntilReady = async (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
) => {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(5, 1);
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  });
};

describe("ShaderReadyGate", () => {
  it("calls onReadyChange(false) then onReadyChange(true) after compile completes", async () => {
    const onReadyChange = vi.fn();

    const renderer = await ReactThreeTestRenderer.create(
      <ShaderReadyGate
        key="menu"
        compileKey="menu"
        onReadyChange={onReadyChange}
      />
    );

    try {
      expect(onReadyChange).toHaveBeenCalledWith(false);

      await advanceUntilReady(renderer);

      expect(onReadyChange).toHaveBeenCalledWith(true);
    } finally {
      renderer.unmount();
    }
  });

  it("ignores stale callbacks after compileKey changes", async () => {
    const onReadyChange = vi.fn();

    const renderer = await ReactThreeTestRenderer.create(
      <ShaderReadyGate
        key="menu"
        compileKey="menu"
        onReadyChange={onReadyChange}
      />
    );

    try {
      await advanceUntilReady(renderer);
      onReadyChange.mockClear();

      await ReactThreeTestRenderer.act(async () => {
        renderer.update(
          <ShaderReadyGate
            key="game-1"
            compileKey="game-1"
            onReadyChange={onReadyChange}
          />
        );
      });

      await advanceUntilReady(renderer);

      expect(onReadyChange).toHaveBeenCalledWith(false);
      expect(onReadyChange).toHaveBeenLastCalledWith(true);
    } finally {
      renderer.unmount();
    }
  });

  it("signals not ready on unmount", async () => {
    const onReadyChange = vi.fn();

    const renderer = await ReactThreeTestRenderer.create(
      <ShaderReadyGate
        key="menu"
        compileKey="menu"
        onReadyChange={onReadyChange}
      />
    );

    await advanceUntilReady(renderer);
    onReadyChange.mockClear();

    await ReactThreeTestRenderer.act(async () => {
      renderer.unmount();
    });

    expect(onReadyChange).toHaveBeenCalledWith(false);
  });
});
