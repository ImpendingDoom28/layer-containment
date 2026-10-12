import { useCallback, useRef, useState } from "react";

export type HeldClose = {
  closing: boolean;
  startClose: (action?: () => void) => void;
  finishClose: (fallback?: () => void) => void;
  cancelClose: () => void;
};

export const useHeldClose = (): HeldClose => {
  const [closing, setClosing] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const startClose = useCallback(
    (action?: () => void) => {
      if (closing) return;
      pendingActionRef.current = action ?? null;
      setClosing(true);
    },
    [closing]
  );

  const finishClose = useCallback((fallback?: () => void) => {
    const action = pendingActionRef.current ?? fallback;
    pendingActionRef.current = null;
    setClosing(false);
    action?.();
  }, []);

  const cancelClose = useCallback(() => {
    pendingActionRef.current = null;
    setClosing(false);
  }, []);

  return { closing, startClose, finishClose, cancelClose };
};
