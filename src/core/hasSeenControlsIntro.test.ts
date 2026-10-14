import { describe, expect, it, beforeEach } from "vitest";

import {
  hasSeenControlsIntro,
  markControlsIntroSeen,
} from "./hasSeenControlsIntro";

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const createMemoryStorage = (): MemoryStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

const installStorage = (storage: MemoryStorage | undefined) => {
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
};

describe("hasSeenControlsIntro", () => {
  beforeEach(() => {
    installStorage(createMemoryStorage());
  });

  it("reports unseen when nothing is stored", () => {
    expect(hasSeenControlsIntro()).toBe(false);
  });

  it("reports seen after markControlsIntroSeen", () => {
    markControlsIntroSeen();
    expect(hasSeenControlsIntro()).toBe(true);
  });

  it("reports seen when the flag was stored externally", () => {
    globalThis.localStorage.setItem(
      "containment-layer-controls-intro-seen",
      "1"
    );
    expect(hasSeenControlsIntro()).toBe(true);
  });

  it("tolerates missing storage and treats it as seen", () => {
    installStorage(undefined);
    expect(hasSeenControlsIntro()).toBe(true);
    expect(() => markControlsIntroSeen()).not.toThrow();
  });

  it("tolerates throwing storage and treats it as seen", () => {
    installStorage({
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(hasSeenControlsIntro()).toBe(true);
    expect(() => markControlsIntroSeen()).not.toThrow();
  });
});
