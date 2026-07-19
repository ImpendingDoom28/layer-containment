import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { GameEvent } from "../../../../core/types/enums/events";
import { gameEvents } from "../../../../utils/eventEmitter";

type HoldButtonState = "idle" | "holding";

type UseHoldButtonOptions = {
  duration: number;
  fillResetTransitionMs: number;
  disabled?: boolean;
  deniedData?: unknown;
  onConfirm: () => void;
  onAbort?: (progress: number) => void;
};

type UseHoldButtonResult = {
  state: HoldButtonState;
  progress: number;
  isAnimatingReset: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

export const useHoldButton = ({
  duration,
  fillResetTransitionMs,
  disabled = false,
  deniedData,
  onConfirm,
  onAbort,
}: UseHoldButtonOptions): UseHoldButtonResult => {
  const [state, setState] = useState<HoldButtonState>("idle");
  const [progress, setProgress] = useState(0);
  const [isAnimatingReset, setIsAnimatingReset] = useState(false);

  const stateRef = useRef<HoldButtonState>("idle");
  const progressRef = useRef(0);
  const holdStartTimeRef = useRef<number | null>(null);
  const ref = useRef<number | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const keyboardHoldRef = useRef(false);

  const clearRef = useCallback(() => {
    if (ref.current !== null) {
      cancelAnimationFrame(ref.current);
      ref.current = null;
    }
  }, []);

  const clearResetTimeout = useCallback(() => {
    if (resetTimeoutRef.current !== null) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, []);

  const resetProgress = useCallback(() => {
    clearRef();
    holdStartTimeRef.current = null;
    progressRef.current = 0;
    setProgress(0);
  }, [clearRef]);

  const animateReset = useCallback(() => {
    clearResetTimeout();
    setIsAnimatingReset(true);
    resetProgress();
    resetTimeoutRef.current = setTimeout(() => {
      setIsAnimatingReset(false);
      resetTimeoutRef.current = null;
    }, fillResetTransitionMs);
  }, [clearResetTimeout, fillResetTransitionMs, resetProgress]);

  const finishHold = useCallback(
    (nextProgress: number) => {
      clearRef();
      holdStartTimeRef.current = null;
      activePointerIdRef.current = null;
      keyboardHoldRef.current = false;
      stateRef.current = "idle";
      setState("idle");
      progressRef.current = nextProgress;
      setProgress(nextProgress);
    },
    [clearRef]
  );

  const abortHold = useCallback(
    (nextProgress: number) => {
      gameEvents.emit(GameEvent.UI_ACTION_HOLD_ABORT, {
        progress: nextProgress,
      });
      onAbort?.(nextProgress);
      finishHold(0);
      animateReset();
    },
    [animateReset, finishHold, onAbort]
  );

  const completeHold = useCallback(() => {
    gameEvents.emit(GameEvent.UI_ACTION_HOLD_END, {});
    onConfirm();
    finishHold(0);
    animateReset();
  }, [animateReset, finishHold, onConfirm]);

  const tick = useCallback(() => {
    const startTime = holdStartTimeRef.current;
    if (startTime === null) {
      return;
    }

    const elapsed = performance.now() - startTime;
    const nextProgress = Math.min(elapsed / duration, 1);
    progressRef.current = nextProgress;
    setProgress(nextProgress);

    if (nextProgress >= 1) {
      completeHold();
      return;
    }

    ref.current = requestAnimationFrame(tick);
  }, [completeHold, duration]);

  const startHold = useCallback(() => {
    if (disabled || stateRef.current === "holding") {
      return;
    }

    clearResetTimeout();
    setIsAnimatingReset(false);
    stateRef.current = "holding";
    setState("holding");
    holdStartTimeRef.current = performance.now();
    progressRef.current = 0;
    setProgress(0);
    gameEvents.emit(GameEvent.UI_ACTION_HOLD_START, {});
    clearRef();
    ref.current = requestAnimationFrame(tick);
  }, [clearRef, clearResetTimeout, disabled, tick]);

  const endHold = useCallback(() => {
    if (stateRef.current !== "holding") {
      return;
    }

    if (progressRef.current >= 1) {
      return;
    }

    abortHold(progressRef.current);
  }, [abortHold]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      if (disabled) {
        gameEvents.emit(GameEvent.UI_ACTION_DENIED, deniedData);
        return;
      }

      event.preventDefault();
      activePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      startHold();
    },
    [deniedData, disabled, startHold]
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      activePointerIdRef.current = null;
      endHold();
    },
    [endHold]
  );

  const onPointerCancel = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      activePointerIdRef.current = null;
      endHold();
    },
    [endHold]
  );

  const onLostPointerCapture = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      activePointerIdRef.current = null;
      endHold();
    },
    [endHold]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== " " && event.key !== "Enter") {
        return;
      }

      if (disabled) {
        if (!event.repeat) {
          gameEvents.emit(GameEvent.UI_ACTION_DENIED, deniedData);
        }
        return;
      }

      if (event.repeat) {
        return;
      }

      event.preventDefault();
      keyboardHoldRef.current = true;
      startHold();
    },
    [deniedData, disabled, startHold]
  );

  const onKeyUp = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== " " && event.key !== "Enter") {
        return;
      }

      if (!keyboardHoldRef.current) {
        return;
      }

      event.preventDefault();
      keyboardHoldRef.current = false;
      endHold();
    },
    [endHold]
  );

  useEffect(
    () => () => {
      clearRef();
      clearResetTimeout();
    },
    [clearRef, clearResetTimeout]
  );

  useEffect(() => {
    if (disabled && stateRef.current === "holding") {
      abortHold(progressRef.current);
    }
  }, [abortHold, disabled]);

  return {
    state,
    progress,
    isAnimatingReset,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onKeyDown,
    onKeyUp,
  };
};
