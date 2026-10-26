import { FC, useEffect } from "react";

import { UI_ACTION_DENIED_HUD_SHAKE_DURATION_SEC } from "../../constants/uiActionDeniedFeedback";
import { GameEvent } from "../../core/types/enums/events";
import type { UiActionDeniedData } from "../../core/types/game";
import { gameEvents } from "../../utils/eventEmitter";

const DENIED_SHAKE_CLASS = "animate-hud-denied-shake";

/**
 * Plays short, named CSS animations on HUD elements. HUD rows declare a
 * `data-hud-animation-id` and request an animation by that id: a
 * `UI_ACTION_DENIED` event with a matching `elementId` shakes the element.
 *
 * The effect is fire-and-forget and is deliberately kept out of the game
 * store: no per-row counters, no remounts, nothing to reset between runs. The
 * animation class is removed once the animation completes, and re-triggering
 * (remove class, force reflow, re-add) restarts it on rapid re-denials.
 */
export const HudAnimationSystem: FC = () => {
  useEffect(() => {
    const clearTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const playDeniedShake = (elementId: string) => {
      const element = document.querySelector<HTMLElement>(
        `[data-hud-animation-id="${elementId}"]`
      );
      if (!element) return;

      const pending = clearTimers.get(elementId);
      if (pending) clearTimeout(pending);
      element.classList.remove(DENIED_SHAKE_CLASS);
      // Force a reflow so re-adding the class restarts the animation even when
      // the element was still shaking.
      void element.offsetWidth;
      element.classList.add(DENIED_SHAKE_CLASS);

      clearTimers.set(
        elementId,
        setTimeout(() => {
          element.classList.remove(DENIED_SHAKE_CLASS);
          clearTimers.delete(elementId);
        }, UI_ACTION_DENIED_HUD_SHAKE_DURATION_SEC * 1000)
      );
    };

    const unsubscribe = gameEvents.on<UiActionDeniedData>(
      GameEvent.UI_ACTION_DENIED,
      (data) => {
        if (data?.elementId) {
          playDeniedShake(data.elementId);
        }
      }
    );

    return () => {
      unsubscribe();
      for (const timer of clearTimers.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return null;
};

HudAnimationSystem.displayName = "HudAnimationSystem";
