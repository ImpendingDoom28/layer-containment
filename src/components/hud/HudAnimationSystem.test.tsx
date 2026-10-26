// @vitest-environment jsdom
import { createRoot, type ReactNode } from "react-dom/client";
import { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { UI_ACTION_DENIED_HUD_SHAKE_DURATION_SEC } from "../../constants/uiActionDeniedFeedback";
import { GameEvent } from "../../core/types/enums/events";
import { gameEvents } from "../../utils/eventEmitter";
import { HudAnimationSystem } from "./HudAnimationSystem";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
  true;

const targetId = "tower-shop-row-basic";
const shakeClass = "animate-hud-denied-shake";
const shakeDurationMs = UI_ACTION_DENIED_HUD_SHAKE_DURATION_SEC * 1000;

describe("HudAnimationSystem", () => {
  let container: HTMLDivElement;
  let targetElement: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;

  beforeEach(() => {
    vi.useFakeTimers();
    // The system animates elements elsewhere in the document (the HUD rows),
    // so keep the target outside the React root container.
    targetElement = document.createElement("div");
    targetElement.dataset.hudAnimationId = targetId;
    document.body.appendChild(targetElement);
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    vi.runAllTimers();
    vi.useRealTimers();
    container.remove();
    targetElement.remove();
  });

  const mount = () => {
    const element: ReactNode = <HudAnimationSystem />;
    root = createRoot(container);
    act(() => {
      root.render(element);
    });
  };

  const emitDenied = (elementId?: string) => {
    act(() => {
      gameEvents.emit(GameEvent.UI_ACTION_DENIED, {
        reason: "insufficient_funds",
        towerType: "basic",
        ...(elementId ? { elementId } : {}),
      });
    });
  };

  it("shakes the named element on a denied action", () => {
    mount();

    emitDenied(targetId);
    expect(targetElement.classList.contains(shakeClass)).toBe(true);
  });

  it("ignores events without an elementId and without a matching element", () => {
    mount();

    emitDenied(undefined);
    expect(targetElement.classList.contains(shakeClass)).toBe(false);

    act(() => {
      gameEvents.emit(GameEvent.UI_ACTION_DENIED, {
        reason: "insufficient_funds",
        towerType: "basic",
        elementId: "no-such-element",
      });
    });
    expect(targetElement.classList.contains(shakeClass)).toBe(false);
  });

  it("removes the shake class once the animation completes", () => {
    mount();

    emitDenied(targetId);
    expect(targetElement.classList.contains(shakeClass)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(shakeDurationMs);
    });
    expect(targetElement.classList.contains(shakeClass)).toBe(false);
  });

  it("re-triggers the shake on rapid re-denials of the same element", () => {
    mount();

    emitDenied(targetId);
    // Re-deny while the first shake is still running, then let it finish.
    emitDenied(targetId);
    act(() => {
      vi.advanceTimersByTime(shakeDurationMs);
    });
    expect(targetElement.classList.contains(shakeClass)).toBe(false);

    // A later denial starts a fresh shake.
    emitDenied(targetId);
    expect(targetElement.classList.contains(shakeClass)).toBe(true);
  });

  it("does not shake after unmount", () => {
    mount();
    act(() => {
      root!.unmount();
    });
    root = null;

    expect(() => emitDenied(targetId)).not.toThrow();
    expect(targetElement.classList.contains(shakeClass)).toBe(false);
  });
});
