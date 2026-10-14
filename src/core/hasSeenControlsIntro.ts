import { GAME_NAME_ID } from "../constants/game";

const CONTROLS_INTRO_SEEN_KEY = `${GAME_NAME_ID}-controls-intro-seen`;

/**
 * Whether the player has already seen the controls intro modal.
 *
 * Missing or throwing storage counts as seen: the flag cannot be persisted
 * anyway, so showing the intro on every run would be worse than never
 * showing it.
 */
export const hasSeenControlsIntro = (): boolean => {
  try {
    const storage = globalThis.localStorage;
    if (storage === undefined || storage === null) return true;
    return storage.getItem(CONTROLS_INTRO_SEEN_KEY) === "1";
  } catch {
    return true;
  }
};

/**
 * Remembers that the player has seen the controls intro modal.
 */
export const markControlsIntroSeen = (): void => {
  try {
    globalThis.localStorage?.setItem(CONTROLS_INTRO_SEEN_KEY, "1");
  } catch {
    // Blocked storage (e.g. private browsing): the intro just won't be remembered.
  }
};
