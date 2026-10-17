import { useCallback, useSyncExternalStore } from "react";
import type { TFunction } from "i18next";

import { i18n } from "./i18n";

const subscribe = (onStoreChange: () => void) => {
  i18n.on("languageChanged", onStoreChange);
  return () => {
    i18n.off("languageChanged", onStoreChange);
  };
};

// A stable string snapshot: `resolvedLanguage` is only replaced when the
// language actually changes, so `useSyncExternalStore` does not loop.
const getSnapshot = (): string => i18n.resolvedLanguage ?? "";

/**
 * Re-render subscription for i18next that works outside of React context —
 * including inside the R3F canvas, which is a separate reconciler root that
 * does not receive the DOM tree's context (so `useTranslation` is not usable
 * in canvas components). Returns a stable `t` that reads from the i18next
 * singleton.
 */
export const useTranslationInCanvas = (): TFunction<"translation", undefined> => {
  useSyncExternalStore(subscribe, getSnapshot);
  // `i18n.t` is already the fully-typed `TFunction` for the default
  // ("translation") namespace; bind it so it can be passed around safely.
  return useCallback(i18n.t.bind(i18n), []) as TFunction<"translation", undefined>;
};
