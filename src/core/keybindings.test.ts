import { describe, expect, it } from "vitest";

import {
  DEFAULT_KEYBINDINGS,
  KEYBINDING_BY_KEY,
  formatKeyCode,
  getCameraMoveForEvent,
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

describe("getCameraMoveForEvent", () => {
  it("always maps arrow keys to camera moves", () => {
    expect(getCameraMoveForEvent({}, "ArrowUp", noModifiers)).toBe("forward");
    expect(getCameraMoveForEvent({}, "ArrowDown", noModifiers)).toBe(
      "backward"
    );
    expect(getCameraMoveForEvent({}, "ArrowLeft", noModifiers)).toBe("left");
    expect(getCameraMoveForEvent({}, "ArrowRight", noModifiers)).toBe("right");
  });

  it("maps the default WASD/QE bindings", () => {
    expect(
      getCameraMoveForEvent(DEFAULT_KEYBINDINGS, "KeyW", noModifiers)
    ).toBe("forward");
    expect(
      getCameraMoveForEvent(DEFAULT_KEYBINDINGS, "KeyS", noModifiers)
    ).toBe("backward");
    expect(
      getCameraMoveForEvent(DEFAULT_KEYBINDINGS, "KeyA", noModifiers)
    ).toBe("left");
    expect(
      getCameraMoveForEvent(DEFAULT_KEYBINDINGS, "KeyD", noModifiers)
    ).toBe("right");
    expect(
      getCameraMoveForEvent(DEFAULT_KEYBINDINGS, "KeyE", noModifiers)
    ).toBe("up");
    expect(
      getCameraMoveForEvent(DEFAULT_KEYBINDINGS, "KeyQ", noModifiers)
    ).toBe("down");
  });

  it("respects user-configured bindings", () => {
    const config = {
      ...DEFAULT_KEYBINDINGS,
      cameraForward: "KeyI",
      cameraLeft: "Ctrl+KeyL",
    };

    expect(getCameraMoveForEvent(config, "KeyI", noModifiers)).toBe("forward");
    expect(getCameraMoveForEvent(config, "KeyW", noModifiers)).toBe(null);
    expect(
      getCameraMoveForEvent(config, "KeyL", modifiers({ ctrlKey: true }))
    ).toBe("left");
    expect(getCameraMoveForEvent(config, "KeyL", noModifiers)).toBe(null);
  });

  it("returns null for unrelated keys", () => {
    expect(
      getCameraMoveForEvent(DEFAULT_KEYBINDINGS, "KeyM", noModifiers)
    ).toBe(null);
  });
});
