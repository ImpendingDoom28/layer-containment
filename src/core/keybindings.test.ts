import { describe, expect, it } from "vitest";

import {
  DEFAULT_KEYBINDINGS,
  KEYBINDING_BY_KEY,
  formatKeyCode,
  getCameraMovesForEvent,
  matchesKeybinding,
  normalizeKeyToBinding,
  resolveKeybinding,
} from "./keybindings";

type Modifiers = {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

const noModifiers: Modifiers = {
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
};

const modifiers = (partial: Partial<Modifiers> = {}): Modifiers => ({
  ...noModifiers,
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

  it("joins chord modifiers with plus signs", () => {
    expect(formatKeyCode("Ctrl+Shift+Alt+KeyD")).toBe("Ctrl + Shift + Alt + D");
    expect(formatKeyCode("Ctrl+KeyP")).toBe("Ctrl + P");
  });
});

describe("normalizeKeyToBinding", () => {
  it("returns the bare code for a single key", () => {
    expect(normalizeKeyToBinding("KeyW", noModifiers)).toBe("KeyW");
  });

  it("ignores bare modifier presses", () => {
    expect(
      normalizeKeyToBinding("ShiftLeft", modifiers({ shiftKey: true }))
    ).toBeNull();
    expect(
      normalizeKeyToBinding("ControlLeft", modifiers({ ctrlKey: true }))
    ).toBeNull();
  });

  it("builds chords with modifiers in a stable order", () => {
    expect(
      normalizeKeyToBinding(
        "KeyD",
        modifiers({ ctrlKey: true, shiftKey: true, altKey: true })
      )
    ).toBe("Ctrl+Shift+Alt+KeyD");
    expect(
      normalizeKeyToBinding("KeyX", modifiers({ altKey: true, ctrlKey: true }))
    ).toBe("Ctrl+Alt+KeyX");
  });

  it("forbids chords on system-sensitive keys", () => {
    expect(
      normalizeKeyToBinding("Escape", modifiers({ ctrlKey: true }))
    ).toBeNull();
    expect(
      normalizeKeyToBinding("Space", modifiers({ shiftKey: true }))
    ).toBeNull();
  });
});

describe("matchesKeybinding", () => {
  it("matches bare keys only without modifiers", () => {
    expect(matchesKeybinding("KeyW", "KeyW", noModifiers)).toBe(true);
    expect(
      matchesKeybinding("KeyW", "KeyW", modifiers({ shiftKey: true }))
    ).toBe(false);
    expect(matchesKeybinding("KeyW", "KeyA", noModifiers)).toBe(false);
  });

  it("matches chords with exactly the listed modifiers", () => {
    const chord = "Ctrl+Shift+Alt+KeyD";

    expect(
      matchesKeybinding(
        chord,
        "KeyD",
        modifiers({ ctrlKey: true, shiftKey: true, altKey: true })
      )
    ).toBe(true);
    expect(
      matchesKeybinding(
        chord,
        "KeyD",
        modifiers({ ctrlKey: true, shiftKey: true })
      )
    ).toBe(false);
    expect(
      matchesKeybinding(
        chord,
        "KeyD",
        modifiers({
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
      matchesKeybinding("Ctrl+KeyP", "KeyP", modifiers({ ctrlKey: true }))
    ).toBe(true);
    expect(matchesKeybinding("Ctrl+KeyP", "KeyP", noModifiers)).toBe(false);
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

describe("getCameraMovesForEvent", () => {
  it("maps the default WASD/QE bindings on key down", () => {
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, "KeyW", noModifiers, "down")
    ).toEqual(["forward"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, "KeyS", noModifiers, "down")
    ).toEqual(["backward"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, "KeyA", noModifiers, "down")
    ).toEqual(["left"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, "KeyD", noModifiers, "down")
    ).toEqual(["right"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, "KeyE", noModifiers, "down")
    ).toEqual(["up"]);
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, "KeyQ", noModifiers, "down")
    ).toEqual(["down"]);
  });

  it("always maps arrow keys to camera moves", () => {
    expect(getCameraMovesForEvent({}, "ArrowUp", noModifiers, "down")).toEqual([
      "forward",
    ]);
    expect(
      getCameraMovesForEvent({}, "ArrowDown", noModifiers, "down")
    ).toEqual(["backward"]);
    expect(
      getCameraMovesForEvent({}, "ArrowLeft", noModifiers, "down")
    ).toEqual(["left"]);
    expect(
      getCameraMovesForEvent({}, "ArrowRight", noModifiers, "down")
    ).toEqual(["right"]);
  });

  it("respects user-configured bindings with exact modifier matching on down", () => {
    const config = {
      ...DEFAULT_KEYBINDINGS,
      cameraForward: "KeyI",
      cameraLeft: "Ctrl+KeyL",
    };

    expect(getCameraMovesForEvent(config, "KeyI", noModifiers, "down")).toEqual(
      ["forward"]
    );
    expect(getCameraMovesForEvent(config, "KeyW", noModifiers, "down")).toEqual(
      []
    );
    expect(
      getCameraMovesForEvent(
        config,
        "KeyL",
        modifiers({ ctrlKey: true }),
        "down"
      )
    ).toEqual(["left"]);
    expect(getCameraMovesForEvent(config, "KeyL", noModifiers, "down")).toEqual(
      []
    );
  });

  it("returns an empty list for unrelated keys", () => {
    expect(
      getCameraMovesForEvent(DEFAULT_KEYBINDINGS, "KeyM", noModifiers, "down")
    ).toEqual([]);
  });

  it("clears the key of a chord binding without modifiers on up", () => {
    const config = {
      ...DEFAULT_KEYBINDINGS,
      cameraLeft: "Ctrl+KeyL",
    };

    // Keyup for the chord key must clear "left" even when modifiers no longer
    // match (the CodeRabbit finding).
    expect(getCameraMovesForEvent(config, "KeyL", noModifiers, "up")).toEqual([
      "left",
    ]);
  });

  it("clears the movement on key up even with mismatched modifiers", () => {
    // Hold W, press Shift, release W: keyup fires with shiftKey true, so a
    // modifier-aware match would leave "forward" stuck on.
    expect(
      getCameraMovesForEvent(
        DEFAULT_KEYBINDINGS,
        "KeyW",
        modifiers({ shiftKey: true }),
        "up"
      )
    ).toContain("forward");
  });

  it("clears every movement bound to the same code on up", () => {
    const config = {
      ...DEFAULT_KEYBINDINGS,
      cameraUp: "KeyW",
    };

    expect(
      getCameraMovesForEvent(config, "KeyW", noModifiers, "up").sort()
    ).toEqual(["forward", "up"]);
  });
});
