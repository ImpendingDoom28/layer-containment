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

export type KeybindingDefinition = {
  key: KeybindingKey;
  label: string;
  visible?: boolean;
};

export type KeybindingsConfig = Record<KeybindingKey, string>;

export type KeyModifiers = Pick<
  KeyboardEvent,
  "ctrlKey" | "shiftKey" | "altKey" | "metaKey"
>;

// A key input event as consumed by the matching/normalization helpers: just
// the physical code plus modifier state, so tests can pass plain objects.
export type KeybindingEvent = Pick<
  KeyboardEvent,
  "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey"
>;

export const KEYBINDING_DEFINITIONS: readonly KeybindingDefinition[] = [
  { key: "cameraForward", label: "Move forward" },
  { key: "cameraBackward", label: "Move backward" },
  { key: "cameraLeft", label: "Move left" },
  { key: "cameraRight", label: "Move right" },
  { key: "cameraUp", label: "Move up" },
  { key: "cameraDown", label: "Move down" },
  { key: "pause", label: "Pause / Resume" },
  { key: "menu", label: "Open / close menu" },
  { key: "toggleDebug", label: "Toggle debug overlay", visible: false },
];

// Bindings that can be changed from the Settings panel. The debug toggle is
// development-only and stays out of the UI.
export const VISIBLE_KEYBINDING_DEFINITIONS = KEYBINDING_DEFINITIONS.filter(
  (definition) => definition.visible !== false
);

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

export const MODIFIER_CODES = new Set([
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
export const CHORD_FORBIDDEN_CODES = new Set([
  "Space",
  "Escape",
  "Enter",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const DIGIT_CODE_PREFIXES = ["Digit", "Numpad"];

export const KEY_CODE_LABELS: Record<string, string> = {
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
  ...Object.fromEntries(
    DIGIT_CODE_PREFIXES.flatMap((prefix) =>
      Array.from({ length: 10 }, (_, digit) => [
        `${prefix}${digit}`,
        String(digit),
      ])
    )
  ),
};

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
export const ARROW_MOVES: Record<string, CameraMove> = {
  ArrowUp: "forward",
  ArrowDown: "backward",
  ArrowLeft: "left",
  ArrowRight: "right",
};
