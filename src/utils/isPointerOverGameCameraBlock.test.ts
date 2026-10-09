/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import {
  GAME_CAMERA_BLOCK_SELECTOR,
  isPointerOverGameCameraBlock,
} from "./isPointerOverGameCameraBlock";

describe("isPointerOverGameCameraBlock", () => {
  it("returns false when hit element is outside a camera block", () => {
    const root = document.createElement("div");
    const child = document.createElement("button");
    root.appendChild(child);
    document.body.append(root);
    expect(isPointerOverGameCameraBlock(1, 1)).toBe(false);
    root.remove();
  });

  it("returns true when hit element is inside a camera block", () => {
    const hud = document.createElement("div");
    hud.toggleAttribute("data-game-camera-block", true);
    const child = document.createElement("button");
    hud.appendChild(child);
    document.body.append(hud);
    expect(isPointerOverGameCameraBlock(1, 1)).toBe(true);
    hud.remove();
  });

  it("exposes selector matching HUDWrapper attribute", () => {
    expect(GAME_CAMERA_BLOCK_SELECTOR).toBe("[data-game-camera-block]");
  });
});
