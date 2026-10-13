const KEYBINDING_KEYS = [
  "cameraForward",
  "cameraBackward",
  "cameraLeft",
  "cameraRight",
  "cameraUp",
  "cameraDown",
  "pause",
  "menu",
  "toggleDebug",
] as const;

export type KeybindingKey = (typeof KEYBINDING_KEYS)[number];

export type KeybindingKind = "key" | "chord";

export type KeybindingDefinition = {
  key: KeybindingKey;
  label: string;
  kind: KeybindingKind;
};

export type KeybindingsConfig = Record<KeybindingKey, string>;

export const KEYBINDING_DEFINITIONS: readonly KeybindingDefinition[] = [
  { key: "cameraForward", label: "Move forward", kind: "key" },
  { key: "cameraBackward", label: "Move backward", kind: "key" },
  { key: "cameraLeft", label: "Move left", kind: "key" },
  { key: "cameraRight", label: "Move right", kind: "key" },
  { key: "cameraUp", label: "Move up", kind: "key" },
  { key: "cameraDown", label: "Move down", kind: "key" },
  { key: "pause", label: "Pause / Resume", kind: "key" },
  { key: "menu", label: "Open / close menu", kind: "key" },
  { key: "toggleDebug", label: "Toggle debug overlay", kind: "chord" },
];

export const KEYBINDING_BY_KEY = Object.fromEntries(
  KEYBINDING_DEFINITIONS.map((definition) => [definition.key, definition])
) as Record<KeybindingKey, KeybindingDefinition>;

/**
 * Binding tokens are physical key codes (`e.code`) so bindings behave
 * identically across keyboard layouts. A bare code is a single key
 * ("KeyW", "Space"); a chord is "Ctrl+Shift+Alt+KeyD"-style with the key
 * code last. Any control may hold either form.
 */
export const DEFAULT_KEYBINDINGS: KeybindingsConfig = {
  cameraForward: "KeyW",
  cameraBackward: "KeyS",
  cameraLeft: "KeyA",
  cameraRight: "KeyD",
  cameraUp: "KeyE",
  cameraDown: "KeyQ",
  pause: "Space",
  menu: "Escape",
  toggleDebug: "Ctrl+Shift+Alt+KeyD",
};

const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

// Keys that already carry system/panel semantics; keep them out of chords so
// a rebind can never swallow Escape (used to cancel rebinds) or the spacebar.
const CHORD_FORBIDDEN_CODES = new Set([
  "Space",
  "Escape",
  "Enter",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

type KeyModifiers = Pick<
  KeyboardEvent,
  "ctrlKey" | "shiftKey" | "altKey" | "metaKey"
>;

/**
 * Normalizes a keydown event into a binding token. Returns null for bare
 * modifier presses and for forbidden chords so the caller can ignore them.
 */
export const normalizeKeyToBinding = (
  code: string,
  modifiers: KeyModifiers
): string | null => {
  if (MODIFIER_CODES.has(code)) {
    return null;
  }

  const parts: string[] = [];
  if (modifiers.ctrlKey) parts.push("Ctrl");
  if (modifiers.shiftKey) parts.push("Shift");
  if (modifiers.altKey) parts.push("Alt");
  if (modifiers.metaKey) parts.push("Meta");

  if (parts.length === 0) {
    return code;
  }

  if (CHORD_FORBIDDEN_CODES.has(code)) {
    return null;
  }

  return `${parts.join("+")}+${code}`;
};

/**
 * Whether a keydown event matches a stored binding token (a bare key code
 * or a "Ctrl+Shift+Alt+KeyD"-style chord). Bare keys require no modifiers;
 * chords require exactly the listed modifiers. Used by every consumer so
 * matching behavior stays identical.
 */
export const matchesKeybinding = (
  token: string,
  code: string,
  modifiers: KeyModifiers
): boolean => {
  if (token.includes("+")) {
    const parts = token.split("+");
    const keyCode = parts[parts.length - 1];
    const chord = parts.slice(0, -1).join("+");

    const expected: string[] = [];
    if (modifiers.ctrlKey) expected.push("Ctrl");
    if (modifiers.shiftKey) expected.push("Shift");
    if (modifiers.altKey) expected.push("Alt");
    if (modifiers.metaKey) expected.push("Meta");

    return code === keyCode && chord === expected.join("+");
  }

  return (
    code === token &&
    !modifiers.ctrlKey &&
    !modifiers.shiftKey &&
    !modifiers.altKey &&
    !modifiers.metaKey
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

const KEY_CODE_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  Escape: "Esc",
  Enter: "Enter",
  Backspace: "Bksp",
  Delete: "Del",
  Tab: "Tab",
  CapsLock: "Caps",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
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

export type CameraMove =
  "forward" | "backward" | "left" | "right" | "up" | "down";

export const CAMERA_MOVE_BINDINGS: Record<CameraMove, KeybindingKey> = {
  forward: "cameraForward",
  backward: "cameraBackward",
  left: "cameraLeft",
  right: "cameraRight",
  up: "cameraUp",
  down: "cameraDown",
};

// Arrow keys always steer the camera (as before the bindings were
// configurable) on top of whatever keys the user has assigned.
const ARROW_MOVES: Record<string, CameraMove> = {
  ArrowUp: "forward",
  ArrowDown: "backward",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/**
 * Maps a keydown event to the camera movement it drives, if any. Arrow keys
 * are always active; the user-configured bindings are checked for the
 * remaining codes.
 */
export const getCameraMoveForEvent = (
  config: Partial<KeybindingsConfig>,
  code: string,
  modifiers: KeyModifiers
): CameraMove | null => {
  const arrowMove = ARROW_MOVES[code];
  if (arrowMove) {
    return arrowMove;
  }

  for (const [move, bindingKey] of Object.entries(CAMERA_MOVE_BINDINGS) as [
    CameraMove,
    KeybindingKey,
  ][]) {
    if (
      matchesKeybinding(
        resolveKeybinding(config, KEYBINDING_BY_KEY[bindingKey]),
        code,
        modifiers
      )
    ) {
      return move;
    }
  }

  return null;
};
