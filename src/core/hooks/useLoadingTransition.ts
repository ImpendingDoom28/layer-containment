import { useCallback, useEffect, useState } from "react";

type UseLoadingTransitionResult = {
  /** Whether the overlay is (still) mounted. */
  isShowing: boolean;
  /** Whether the overlay is playing its exit animation. */
  isClosing: boolean;
  /** Reports that the exit animation finished; unmounts the overlay. */
  onExited: () => void;
};

/**
 * Keeps a loading overlay mounted while `isReady` is false, then lets it
 * play its exit animation (closing) and unmounts it once the component
 * reports the exit via `onExited`.
 */
export const useLoadingTransition = (
  isReady: boolean
): UseLoadingTransitionResult => {
  const [isShowing, setIsShowing] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isReady && isShowing) {
      setIsClosing(true);
    }
  }, [isReady, isShowing]);

  const onExited = useCallback(() => {
    setIsShowing(false);
    setIsClosing(false);
  }, []);

  return { isShowing, isClosing, onExited };
};
