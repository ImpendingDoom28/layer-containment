// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldProvider } from "koota/react";

import { testWorld } from "../../core/ecs/world";
import { worldBaseActions } from "../../core/ecs/actions/baseActions";
import { isBase } from "../../core/ecs/traits/base";
import { HealthInfo } from "../../core/ecs/traits/health";
import { useGameStore } from "../../core/stores/useGameStore";
import { HUDBaseDamageFlash } from "./HUDBaseDamageFlash";

(globalThis as unknown as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] =
  true;

const MAX_FLASH = 0.38;

const getFlash = (container: HTMLDivElement) =>
  container.querySelector<HTMLElement>("[data-testid=base-damage-flash]");

describe("HUDBaseDamageFlash", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;

  const mount = () => {
    const element: ReactNode = (
      <WorldProvider world={testWorld}>
        <HUDBaseDamageFlash />
      </WorldProvider>
    );
    const newRoot = createRoot(container);
    root = newRoot;
    act(() => {
      newRoot.render(element);
    });
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
    container = document.createElement("div");
    document.body.appendChild(container);
    worldBaseActions(testWorld).spawnBase(20);
    useGameStore.getState().setGameStatus("playing");
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    worldBaseActions(testWorld).removeBase();
    useGameStore.getState().setGameStatus("menu");
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    container.remove();
  });

  it("spikes the red flash when the base takes damage while playing", () => {
    mount();
    const flash = getFlash(container);
    expect(flash).not.toBeNull();
    expect(parseFloat(flash!.style.opacity)).toBe(0);

    act(() => {
      testWorld.queryFirst(isBase)!.set(HealthInfo, {
        currentHealth: 10,
        maxHealth: 20,
      });
    });

    expect(parseFloat(flash!.style.opacity)).toBeCloseTo(MAX_FLASH, 2);
  });

  it("does not flash when health is restored (heal / run reset)", () => {
    mount();
    const flash = getFlash(container);
    // Drop first to establish the baseline at a lower value.
    act(() => {
      testWorld.queryFirst(isBase)!.set(HealthInfo, {
        currentHealth: 10,
        maxHealth: 20,
      });
    });
    expect(parseFloat(flash!.style.opacity)).toBeCloseTo(MAX_FLASH, 2);

    // Let it fully decay, then heal back up: a heal must not re-spike.
    for (let i = 0; i < 20; i++) vi.advanceTimersByTime(100);
    expect(parseFloat(flash!.style.opacity)).toBe(0);

    act(() => {
      testWorld.queryFirst(isBase)!.set(HealthInfo, {
        currentHealth: 20,
        maxHealth: 20,
      });
    });
    expect(parseFloat(flash!.style.opacity)).toBe(0);
  });

  it("does not flash when the base is hit outside of playing", () => {
    useGameStore.getState().setGameStatus("paused");
    mount();
    const flash = getFlash(container);

    act(() => {
      testWorld.queryFirst(isBase)!.set(HealthInfo, {
        currentHealth: 10,
        maxHealth: 20,
      });
    });

    expect(parseFloat(flash!.style.opacity)).toBe(0);
  });

  it("decays the flash back to zero over time", () => {
    mount();
    const flash = getFlash(container);
    act(() => {
      testWorld.queryFirst(isBase)!.set(HealthInfo, {
        currentHealth: 10,
        maxHealth: 20,
      });
    });
    expect(parseFloat(flash!.style.opacity)).toBeCloseTo(MAX_FLASH, 2);

    for (let i = 0; i < 10; i++) vi.advanceTimersByTime(100);
    expect(parseFloat(flash!.style.opacity)).toBeLessThan(MAX_FLASH);
    expect(parseFloat(flash!.style.opacity)).toBeGreaterThan(0);

    for (let i = 0; i < 20; i++) vi.advanceTimersByTime(100);
    expect(parseFloat(flash!.style.opacity)).toBe(0);
  });
});
