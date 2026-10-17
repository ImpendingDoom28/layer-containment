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
 * in canvas components). Returns a `t` that reads from the i18next singleton
 * and re-renders consumers on language changes.
 */
export const useTranslationInCanvas = (): TFunction<"translation", undefined> => {
  const language = useSyncExternalStore(subscribe, getSnapshot);
  // The identity follows the language snapshot, so memos that depend on `t`
  // recompute their translations when the language changes.
  return useCallback(i18n.t.bind(i18n), [language]) as TFunction<
    "translation",
    undefined
  >;
};
