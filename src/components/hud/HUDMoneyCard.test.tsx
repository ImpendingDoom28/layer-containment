// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLevelStore } from "../../core/stores/useLevelStore";
import { GameEvent } from "../../core/types/enums/events";
import type { MoneyChangedData } from "../../core/types/game";
import { gameEvents } from "../../utils/eventEmitter";
import { HUDMoneyCard } from "./HUDMoneyCard";

// UIMoney renders the icon through `import.meta.glob`; the card test only
// cares that the (tweened) number lands, so stub it with a plain span.
vi.mock("../ui/UIMoney", () => ({
  UIMoney: ({ money }: { money: number }) =>
    createElement("span", { "data-testid": "money-display" }, String(money)),
}));

(globalThis as unknown as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] =
  true;

const FLASH_CLASS = "is-flashing";
const FLASH_DURATION_MS = 600;

// The money tween is rAF-driven; stub rAF to capture callbacks and drive them
// at explicit timestamps (the flash cleanup uses `setTimeout`, which is faked).
class RafDriver {
  callbacks: ((now: number) => void)[] = [];
  // Align the fake rAF timestamps with the real `performance.now()` the hook
  // reads as its tween start, so `advance()` yields valid elapsed deltas.
  now = performance.now();

  raf = (cb: (now: number) => void): number => {
    this.callbacks.push(cb);
    return this.callbacks.length;
  };
  cancel = (): void => {
    this.callbacks.length = 0;
  };
  advance = (ms: number): void => {
    this.now += ms;
    const cbs = this.callbacks;
    this.callbacks = [];
    cbs.forEach((cb) => cb(this.now));
  };
}

describe("HUDMoneyCard", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;
  let raf: RafDriver;
  let flash: HTMLElement | null;

  const mount = () => {
    const element: ReactNode = createElement(HUDMoneyCard, {
      variant: "h4",
      iconSize: 20,
    });
    const newRoot = createRoot(container);
    root = newRoot;
    act(() => {
      newRoot.render(element);
    });
    flash = container.querySelector<HTMLElement>(
      "[data-testid=money-card-flash]"
    );
  };

  const emitMoneyChanged = (direction: MoneyChangedData["direction"]) => {
    act(() => {
      gameEvents.emit(GameEvent.MONEY_CHANGED, {
        amount: useLevelStore.getState().money,
        direction,
      });
    });
  };

  const displayed = () =>
    container
      .querySelector<HTMLElement>("[data-testid=money-display]")!
      .textContent!.trim();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // Reduced motion is off in these tests (the card tweens normally).
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }))
    );
    raf = new RafDriver();
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) =>
      raf.raf(cb)
    );
    vi.stubGlobal("cancelAnimationFrame", () => raf.cancel());
    container = document.createElement("div");
    document.body.appendChild(container);
    useLevelStore.setState({ money: 0 });
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useLevelStore.setState({ money: 0 });
    container.remove();
  });

  it("shows the money from the level store", () => {
    useLevelStore.setState({ money: 150 });
    mount();
    expect(displayed()).toBe("150");
  });

  it("flashes gold on an increase", () => {
    mount();
    expect(flash!.classList.contains(FLASH_CLASS)).toBe(false);

    emitMoneyChanged("increase");
    expect(flash!.dataset["moneyFlash"]).toBe("increase");
    expect(flash!.classList.contains(FLASH_CLASS)).toBe(true);
  });

  it("flashes red on a spend", () => {
    mount();
    emitMoneyChanged("decrease");
    expect(flash!.dataset["moneyFlash"]).toBe("decrease");
    expect(flash!.classList.contains(FLASH_CLASS)).toBe(true);
  });

  it("clears the flash once the animation completes", () => {
    mount();
    emitMoneyChanged("increase");
    expect(flash!.classList.contains(FLASH_CLASS)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(FLASH_DURATION_MS);
    });
    expect(flash!.classList.contains(FLASH_CLASS)).toBe(false);
  });

  it("re-triggers on rapid consecutive changes (restarts the animation)", () => {
    mount();
    emitMoneyChanged("increase");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // Second change before the first flash cleared: fresh flash.
    emitMoneyChanged("increase");
    expect(flash!.classList.contains(FLASH_CLASS)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(FLASH_DURATION_MS);
    });
    expect(flash!.classList.contains(FLASH_CLASS)).toBe(false);
  });

  it("eases the displayed number toward a new store value (~250ms)", () => {
    mount();

    act(() => {
      useLevelStore.setState({ money: 300 });
    });
    // The tween starts from the on-screen value; mid-flight it is partway.
    act(() => {
      raf.advance(125);
    });
    const mid = Number(displayed());
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(300);

    act(() => {
      raf.advance(250);
    });
    expect(displayed()).toBe("300");
  });

  it("does not flash after unmount", () => {
    mount();
    act(() => {
      root!.unmount();
    });
    root = null;
    flash = null;

    expect(() =>
      act(() => {
        gameEvents.emit(GameEvent.MONEY_CHANGED, {
          amount: 10,
          direction: "increase",
        });
      })
    ).not.toThrow();
  });
});
