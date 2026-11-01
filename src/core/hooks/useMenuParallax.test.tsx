// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGameStore } from "../stores/useGameStore";
import { useMenuParallax } from "./useMenuParallax";

// React 19's act needs this flag to avoid a warning.
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
  true;

// The hook coalesces pointer moves through requestAnimationFrame; drive the
// frame queue manually so the tests control when a frame is processed.
const { mediaQuery, requestAnimationFrame, cancelAnimationFrame, runFrames } =
  vi.hoisted(() => {
    const mediaQuery = { matches: false };
    let queue: { id: number; cb: FrameRequestCallback }[] = [];
    let nextId = 1;
    const requestAnimationFrame = (cb: FrameRequestCallback) => {
      const id = nextId++;
      queue.push({ id, cb });
      return id;
    };
    const cancelAnimationFrame = (id: number) => {
      queue = queue.filter((q) => q.id !== id);
    };
    const runFrames = () => {
      const pending = queue;
      queue = [];
      for (const entry of pending) entry.cb(16);
    };
    return {
      mediaQuery,
      requestAnimationFrame,
      cancelAnimationFrame,
      runFrames,
    };
  });

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: mediaQuery.matches,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  onchange: null,
  dispatchEvent: () => false,
}));
vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

const PARALLAX_MAX_OFFSET_PX = 6;

const Probe = () => {
  useMenuParallax();
  return null;
};

const root = document.documentElement;
const setPropertySpy = vi.spyOn(root.style, "setProperty");

const dispatchPointerMove = (clientX: number, clientY: number) => {
  root.dispatchEvent(new PointerEvent("pointermove", { clientX, clientY }));
};

const mount = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  act(() => {
    reactRoot.render(<Probe />);
  });
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    act(() => {
      reactRoot.unmount();
    });
    container.remove();
  };
};

beforeEach(() => {
  setPropertySpy.mockClear();
  mediaQuery.matches = false;
  useGameStore.setState({ gameStatus: "menu" });
});

describe("useMenuParallax", () => {
  it("coalesces pointer moves to one update per frame with the latest position", () => {
    const unmountProbe = mount();
    const width = window.innerWidth;
    const height = window.innerHeight;

    try {
      // Three moves within the same frame: only the last position should be
      // applied, and exactly once per property.
      dispatchPointerMove(10, 10);
      dispatchPointerMove(width * 0.25, height * 0.5);
      dispatchPointerMove(width * 0.9, height * 0.75);

      expect(setPropertySpy).not.toHaveBeenCalled();

      runFrames();

      // x, y, proximity — one set per property per frame, not per pointermove.
      expect(setPropertySpy).toHaveBeenCalledTimes(3);
      const nx = (width * 0.9) / width;
      const ny = (height * 0.75) / height;
      expect(root.style.getPropertyValue("--ui-menu-parallax-x")).toBe(
        `${PARALLAX_MAX_OFFSET_PX * (nx * 2 - 1)}`
      );
      expect(root.style.getPropertyValue("--ui-menu-parallax-y")).toBe(
        `${PARALLAX_MAX_OFFSET_PX * (ny * 2 - 1) * 0.6}`
      );

      // A second frame with a single move applies again.
      setPropertySpy.mockClear();
      dispatchPointerMove(0, 0);
      runFrames();
      expect(setPropertySpy).toHaveBeenCalledTimes(3);
    } finally {
      unmountProbe();
    }
  });

  it("stays silent with reduced motion", () => {
    // Must hold before the first mount so the hook's initial sync sees it.
    mediaQuery.matches = true;
    const unmountProbe = mount();

    try {
      dispatchPointerMove(400, 300);
      runFrames();

      expect(setPropertySpy).not.toHaveBeenCalled();
      expect(root.classList.contains("ui-menu-parallax-on")).toBe(false);
    } finally {
      unmountProbe();
    }
  });

  it("cancels a queued frame on unmount", () => {
    const unmountProbe = mount();

    try {
      dispatchPointerMove(400, 300);

      unmountProbe();

      // The frame was queued before unmount; cleanup must cancel it so the
      // callback never touches the root after cleanup.
      runFrames();
      expect(setPropertySpy).not.toHaveBeenCalled();
    } finally {
      unmountProbe();
    }
  });

  it("stops updating when the game leaves the menu status", () => {
    const unmountProbe = mount();

    try {
      // The hook subscribes to the store, so the status change alone disables it.
      useGameStore.setState({ gameStatus: "playing" });

      dispatchPointerMove(400, 300);
      runFrames();

      expect(setPropertySpy).not.toHaveBeenCalled();
      expect(root.classList.contains("ui-menu-parallax-on")).toBe(false);
    } finally {
      unmountProbe();
    }
  });
});
