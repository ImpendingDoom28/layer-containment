import { describe, expect, it } from "vitest";

import {
  formatKeyCode,
  getCameraMovesForEvent,
  matchesControlSchemePreset,
  matchesKeybinding,
  normalizeKeyToBinding,
  resolveKeybinding,
} from "./keybindings";
import {
  CONTROL_SCHEME_PRESETS,
  DEFAULT_KEYBINDINGS,
  KEYBINDING_BY_KEY,
  type KeybindingEvent,
} from "./keybindingsConstants";

const event = (
  code: string,
  partial: Partial<KeybindingEvent> = {}
): KeybindingEvent => ({
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...partial,
});

describe("formatKeyCode", () => {
  it("formats single letters from Key codes", () => {
    expect(formatKeyCode("KeyW")).toBe("W");
    expect(formatKeyCode("KeyD")).toBe("D");
  });

  it("uses friendly labels for special keys", () => {
    expect(formatKeyCode("Space")).toBe("Space");
    expect(formatKeyCode("Escape")).toBe("Esc");
    expect(formatKeyCode("ArrowUp")).toBe("↑");
    expect(formatKeyCode("BracketLeft")).toBe("[");
  });

  it("formats digit codes as plain digits", () => {
    expect(formatKeyCode("Digit1")).toBe("1");
    expect(formatKeyCode("Digit0")).toBe("0");
    expect(formatKeyCode("Numpad7")).toBe("7");
    expect(formatKeyCode("Ctrl+Digit1")).toBe("Ctrl + 1");
  });

  it("joins chord modifiers with plus signs", () => {
    expect(formatKeyCode("Ctrl+Shift+Alt+KeyD")).toBe("Ctrl + Shift + Alt + D");
    expect(formatKeyCode("Ctrl+KeyP")).toBe("Ctrl + P");
  });
});

describe("normalizeKeyToBinding", () => {
  it("returns the bare code for a single key", () => {
    expect(normalizeKeyToBinding(event("KeyW"))).toBe("KeyW");
  });

  it("ignores bare modifier presses", () => {
    expect(
      normalizeKeyToBinding(event("ShiftLeft", { shiftKey: true }))
    ).toBeNull();
    expect(
      normalizeKeyToBinding(event("ControlLeft", { ctrlKey: true }))
    ).toBeNull();
  });

  it("builds chords with modifiers in a stable order", () => {
    expect(
      normalizeKeyToBinding(
        event("KeyD", { ctrlKey: true, shiftKey: true, altKey: true })
      )
    ).toBe("Ctrl+Shift+Alt+KeyD");
    expect(
      normalizeKeyToBinding(event("KeyX", { altKey: true, ctrlKey: true }))
    ).toBe("Ctrl+Alt+KeyX");
  });

  it("forbids chords on system-sensitive keys", () => {
    expect(
      normalizeKeyToBinding(event("Escape", { ctrlKey: true }))
    ).toBeNull();
    expect(
      normalizeKeyToBinding(event("Space", { shiftKey: true }))
    ).toBeNull();
  });
});

describe("matchesKeybinding", () => {
  it("matches bare keys only without modifiers", () => {
    expect(matchesKeybinding("KeyW", event("KeyW"))).toBe(true);
    expect(matchesKeybinding("KeyW", event("KeyW", { shiftKey: true }))).toBe(
      false
    );
    expect(matchesKeybinding("KeyW", event("KeyA"))).toBe(false);
  });

  it("matches chords with exactly the listed modifiers", () => {
    const chord = "Ctrl+Shift+Alt+KeyD";

    expect(
      matchesKeybinding(
        chord,
        event("KeyD", { ctrlKey: true, shiftKey: true, altKey: true })
      )
    ).toBe(true);
    expect(
      matchesKeybinding(chord, event("KeyD", { ctrlKey: true, shiftKey: true }))
    ).toBe(false);
    expect(
      matchesKeybinding(
        chord,
        event("KeyD", {
          ctrlKey: true,
          shiftKey: true,
          altKey: true,
          metaKey: true,
        })
      )
    ).toBe(false);
  });

  it("distinguishes different chords", () => {
    expect(
      matchesKeybinding("Ctrl+KeyP", event("KeyP", { ctrlKey: true }))
    ).toBe(true);
    expect(matchesKeybinding("Ctrl+KeyP", event("KeyP"))).toBe(false);
  });
});

describe("resolveKeybinding", () => {
  it("falls back to defaults for missing or empty values", () => {
    expect(resolveKeybinding({}, KEYBINDING_BY_KEY.pause)).toBe(
      DEFAULT_KEYBINDINGS.pause
    );
    expect(resolveKeybinding({ pause: "" }, KEYBINDING_BY_KEY.pause)).toBe(
      DEFAULT_KEYBINDINGS.pause
    );
  });

  it("uses the stored value when present", () => {
    expect(resolveKeybinding({ pause: "KeyF9" }, KEYBINDING_BY_KEY.pause)).toBe(
      "KeyF9"
    );
    expect(
      resolveKeybinding(
        { toggleDebug: "Ctrl+KeyB" },
        KEYBINDING_BY_KEY.toggleDebug
      )
    ).toBe("Ctrl+KeyB");
  });
});

describe("matchesControlSchemePreset", () => {
  it("matches the keyboard preset for the default bindings", () => {
    expect(matchesControlSchemePreset(DEFAULT_KEYBINDINGS, "keyboard")).toBe(
      true
    );
  });

  it("matches the mobile preset only for an exact match", () => {
    expect(
      matchesControlSchemePreset(CONTROL_SCHEME_PRESETS.mobile, "mobile")
    ).toBe(true);
    expect(
      matchesControlSchemePreset(
        { ...CONTROL_SCHEME_PRESETS.mobile, cameraForward: "KeyW" },
        "mobile"
      )
    ).toBe(false);
  });

  it("does not match a different scheme", () => {
    expect(matchesControlSchemePreset(DEFAULT_KEYBINDINGS, "mobile")).toBe(
      false
    );
    expect(matchesControlSchemePreset(CONTROL_SCHEME_PRESETS.mobile, "keyboard")).toBe(
      false
    );
  });

  it("does not match a partial config with missing keys", () => {
    expect(matchesControlSchemePreset({}, "keyboard")).toBe(false);
    expect(matchesControlSchemePreset(DEFAULT_KEYBINDINGS, "keyboard")).toBe(
      true
    );
  });
});

describe("getCameraMovesForEvent", () => {
  it("maps the default WASD/QE bindings on key down", () => {
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, event("KeyW"), "down")
    ).toEqual(["forward"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, event("KeyS"), "down")
    ).toEqual(["backward"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, event("KeyA"), "down")
    ).toEqual(["left"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, event("KeyD"), "down")
    ).toEqual(["right"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, event("KeyE"), "down")
    ).toEqual(["up"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, event("KeyQ"), "down")
    ).toEqual(["down"]);
  });

  it("always maps arrow keys to camera moves", () => {
    expect(getCameraMovesForEvent({}, event("ArrowUp"), "down")).toEqual([
      "forward",
    ]);
    expect(getCameraMovesForEvent({}, event("ArrowDown"), "down")).toEqual([
      "backward",
    ]);
    expect(getCameraMovesForEvent({}, event("ArrowLeft"), "down")).toEqual([
      "left",
    ]);
    expect(getCameraMovesForEvent({}, event("ArrowRight"), "down")).toEqual([
      "right",
    ]);
  });

  it("respects user-configured bindings with exact modifier matching on down", () => {
    const config = {
      ...DEFAULT_KEYBINDINGS,
      cameraForward: "KeyI",
      cameraLeft: "Ctrl+KeyL",
    };

    expect(getCameraMovesForEvent(config, event("KeyI"), "down")).toEqual([
      "forward",
    ]);
    expect(getCameraMovesForEvent(config, event("KeyW"), "down")).toEqual([]);
    expect(
      getCameraMovesForEvent(config, event("KeyL", { ctrlKey: true }), "down")
    ).toEqual(["left"]);
    expect(getCameraMovesForEvent(config, event("KeyL"), "down")).toEqual([]);
  });

  it("returns an empty list for unrelated keys", () => {
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, event("KeyM"), "down")
    ).toEqual([]);
  });

  it("clears the key of a chord binding without modifiers on up", () => {
    const config = {
      ...DEFAULT_KEYBINDINGS,
      cameraLeft: "Ctrl+KeyL",
    };

    // Keyup for the chord key must clear "left" even when modifiers no longer
    // match (the CodeRabbit finding).
    expect(getCameraMovesForEvent(config, event("KeyL"), "up")).toEqual([
      "left",
    ]);
  });

  it("clears the movement on key up even with mismatched modifiers", () => {
    // Hold W, press Shift, release W: keyup fires with shiftKey true, so a
    // modifier-aware match would leave "forward" stuck on.
    expect(
      getCameraMovesForEvent(
        DEFAULT_KEYBINDINGS,
        event("KeyW", { shiftKey: true }),
        "up"
      )
    ).toContain("forward");
  });

  it("clears every movement bound to the same code on up", () => {
    const config = {
      ...DEFAULT_KEYBINDINGS,
      cameraUp: "KeyW",
    };

    expect(getCameraMovesForEvent(config, event("KeyW"), "up").sort()).toEqual([
      "forward",
      "up",
    ]);
  });
});
