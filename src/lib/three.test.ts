import { afterEach, describe, expect, it, vi } from "vitest";

import { Clock } from "three";

describe("three alias", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("replaces deprecated THREE.Clock without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    new Clock();

    expect(
      warn.mock.calls.some(([message]) =>
        String(message).includes("THREE.Clock: This module has been deprecated")
      )
    ).toBe(false);
  });
});
