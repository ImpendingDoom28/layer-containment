import {
  ARROW_MOVES,
  CAMERA_MOVE_BINDINGS,
  CHORD_FORBIDDEN_CODES,
  DEFAULT_KEYBINDINGS,
  KEYBINDING_BY_KEY,
  KEY_CODE_LABELS,
  MODIFIER_CODES,
  type CameraMove,
  type KeybindingDefinition,
  type KeybindingEvent,
  type KeybindingKey,
  type KeybindingsConfig,
} from "./keybindingsConstants";

/**
 * Normalizes a key input into a binding token. Returns null for bare
 * modifier presses and for forbidden chords so the caller can ignore them.
 */
export const normalizeKeyToBinding = (
  event: KeybindingEvent
): string | null => {
  if (MODIFIER_CODES.has(event.code)) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  if (event.metaKey) parts.push("Meta");

  if (parts.length === 0) {
    return event.code;
  }

  if (CHORD_FORBIDDEN_CODES.has(event.code)) {
    return null;
  }

  return `${parts.join("+")}+${event.code}`;
};

/**
 * Whether a key input matches a stored binding token (a bare key code or a
 * "Ctrl+Shift+Alt+KeyD"-style chord). Bare keys require no modifiers; chords
 * require exactly the listed modifiers. Used by every consumer so matching
 * behavior stays identical.
 */
export const matchesKeybinding = (
  token: string,
  event: KeybindingEvent
): boolean => {
  if (token.includes("+")) {
    const parts = token.split("+");
    const keyCode = parts[parts.length - 1];
    const chord = parts.slice(0, -1).join("+");

    const expected: string[] = [];
    if (event.ctrlKey) expected.push("Ctrl");
    if (event.shiftKey) expected.push("Shift");
    if (event.altKey) expected.push("Alt");
    if (event.metaKey) expected.push("Meta");

    return event.code === keyCode && chord === expected.join("+");
  }

  return (
    event.code === token &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  );
};

/**
 * Resolves the stored token for a binding, falling back to the default when
 * the stored value is missing (e.g. a config saved before this feature).
 */
export const resolveKeybinding = (
  config: Partial<KeybindingsConfig>,
  definition: KeybindingDefinition
): string => {
  const stored = config[definition.key];

  return typeof stored === "string" && stored.length > 0
    ? stored
    : DEFAULT_KEYBINDINGS[definition.key];
};

export const formatKeyCode = (code: string): string =>
  code
    .split("+")
    .map(
      (part) =>
        KEY_CODE_LABELS[part] ??
        (MODIFIER_CODES.has(part)
          ? part.slice(0, -5)
          : part.replace(/^Key/, ""))
    )
    .join(" + ");

const tokenKeyCode = (token: string): string => {
  const parts = token.split("+");
  return parts[parts.length - 1] ?? token;
};

/**
 * Returns every camera movement bound to the given physical key for the given
 * event phase. Arrow keys are always active. On "down" a binding is matched
 * with its exact modifier state; on "up" only the physical key is matched,
 * because the modifiers held when a key is released can differ from when it was
 * pressed (e.g. releasing a chord's key before its modifiers) and a
 * modifier-aware match would leave the movement stuck on.
 */
export const getCameraMovesForEvent = (
  config: Partial<KeybindingsConfig>,
  event: KeybindingEvent,
  phase: "down" | "up"
): CameraMove[] => {
  const moves: CameraMove[] = [];
  const arrowMove = ARROW_MOVES[event.code];
  if (arrowMove) {
    moves.push(arrowMove);
  }

  for (const [move, bindingKey] of Object.entries(CAMERA_MOVE_BINDINGS) as [
    CameraMove,
    KeybindingKey,
  ][]) {
    const token = resolveKeybinding(config, KEYBINDING_BY_KEY[bindingKey]);
    const matches =
      phase === "up"
        ? tokenKeyCode(token) === event.code
        : matchesKeybinding(token, event);
    if (matches) {
      moves.push(move);
    }
  }

  return moves;
};
