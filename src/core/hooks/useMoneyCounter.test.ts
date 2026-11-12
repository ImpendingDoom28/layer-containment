// @vitest-environment jsdom
import { createElement, type FC } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMoneyCounter } from "./useMoneyCounter";

(globalThis as unknown as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] =
  true;

// Reduced motion is OFF by default; the single reduced-motion test flips it.
const reducedMotion = { value: false };
const matchMedia = vi.fn((query: string) => ({
  matches: query === "(prefers-reduced-motion: reduce)" && reducedMotion.value,
}));

/**
 * The tween is driven by `requestAnimationFrame`; we stub rAF to capture the
 * callbacks and drive them at explicit timestamps (deterministic, no reliance
 * on fake-timer rAF auto-advance).
 */
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

describe("useMoneyCounter", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;
  let raf: RafDriver;
  let target: number;
  let displayedText: () => string;

  const Consumer: FC = () => {
    const displayed = useMoneyCounter(target);
    return createElement(
      "div",
      { "data-testid": "money-display" },
      String(displayed)
    );
  };

  const render = () => {
    act(() => {
      root!.render(createElement(Consumer));
    });
  };

  const setTarget = (value: number) => {
    target = value;
    render();
  };

  beforeEach(() => {
    reducedMotion.value = false;
    vi.stubGlobal("matchMedia", matchMedia);
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) =>
      raf.raf(cb)
    );
    vi.stubGlobal("cancelAnimationFrame", () => raf.cancel());
    raf = new RafDriver();
    target = 100;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    render();
    displayedText = () =>
      container
        .querySelector<HTMLElement>("[data-testid=money-display]")!
        .textContent!.trim();
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    vi.unstubAllGlobals();
    container.remove();
  });

  it("shows the current value immediately on mount (no tween from zero)", () => {
    expect(displayedText()).toBe("100");
  });

  it("tweens a large change over ~250ms with an ease-out curve", () => {
    setTarget(400);

    // Mid-flight (halfway through the 250ms window): past the midpoint already
    // (ease-out front-loads the travel), but not yet at the target.
    act(() => {
      raf.advance(125);
    });
    const mid = Number(displayedText());
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(400);
    expect(mid).toBeGreaterThan(250);

    // By the end of the window the value lands exactly on the target.
    act(() => {
      raf.advance(250);
    });
    expect(displayedText()).toBe("400");
  });

  it("snaps tiny changes instantly (fast path, no full tween)", () => {
    setTarget(103);
    expect(displayedText()).toBe("103");
  });

  it("re-targets from the on-screen value when interrupted mid-flight", () => {
    setTarget(1000);
    act(() => {
      raf.advance(100);
    });
    expect(Number(displayedText())).toBeGreaterThan(100);

    // A new target while the tween is still running must converge on it.
    setTarget(50);
    act(() => {
      raf.advance(400);
    });
    expect(displayedText()).toBe("50");
  });

  it("snaps instantly under prefers-reduced-motion", () => {
    reducedMotion.value = true;
    setTarget(400);
    expect(displayedText()).toBe("400");
  });
});
