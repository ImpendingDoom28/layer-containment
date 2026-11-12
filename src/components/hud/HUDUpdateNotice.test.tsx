// @vitest-environment jsdom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { i18n } from "../../core/i18n/i18n";
import { useUpdateStore } from "../../core/pwa/useUpdateStore";
import { HUDUpdateNotice } from "./HUDUpdateNotice";

(globalThis as unknown as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] =
  true;

let container: HTMLElement;
let root: Root;

beforeAll(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  useUpdateStore.getState().resetUpdateState();
});

const mount = (gameStatus = "menu"): void => {
  root = createRoot(container);
  act(() => {
    root.render(<HUDUpdateNotice gameStatus={gameStatus} />);
  });
};

const setUpdateStatus = (
  status: "idle" | "checking" | "updating" | "ready" | "failed"
): void => {
  act(() => {
    useUpdateStore.getState().setUpdateStatus(status);
  });
};

describe("HUDUpdateNotice", () => {
  it("renders nothing while the update is in flight", () => {
    mount();
    setUpdateStatus("checking");
    expect(container.querySelector('[data-testid="hud-update-notice"]')).toBeNull();
    setUpdateStatus("updating");
    expect(container.querySelector('[data-testid="hud-update-notice"]')).toBeNull();
  });

  it("renders nothing when up-to-date (idle)", () => {
    mount();
    expect(container.querySelector('[data-testid="hud-update-notice"]')).toBeNull();
  });

  it("shows no banner for a ready update in the main menu (it auto-reloads)", () => {
    mount("menu");
    setUpdateStatus("ready");
    expect(container.querySelector('[data-testid="hud-update-notice"]')).toBeNull();
  });

  it("shows a restart banner for a ready update mid-run", () => {
    mount("playing");
    setUpdateStatus("ready");

    const banner = container.querySelector('[data-testid="update-ready-banner"]');
    expect(banner).not.toBeNull();
    // The banner says the game restarts when returning to the menu.
    expect(
      banner?.textContent
    ).toContain(i18n.t("common.updateReadyTitle"));
  });

  it("shows the failure banner and dismisses it for this launch", () => {
    mount();
    setUpdateStatus("failed");

    const banner = container.querySelector('[data-testid="update-failure-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain(i18n.t("common.updateFailed"));

    const dismiss = container.querySelector(
      '[data-testid="update-failure-dismiss"]'
    ) as HTMLButtonElement;
    expect(dismiss).not.toBeNull();
    act(() => {
      dismiss.click();
    });
    expect(
      container.querySelector('[data-testid="update-failure-banner"]')
    ).toBeNull();
  });

  it("does not reshow the dismissed failure until the state is reset", () => {
    mount();
    setUpdateStatus("failed");
    act(() => {
      useUpdateStore.getState().dismissUpdateFailure();
    });
    expect(
      container.querySelector('[data-testid="update-failure-banner"]')
    ).toBeNull();

    // A recheck that fails again must not pop the banner back up...
    setUpdateStatus("idle");
    setUpdateStatus("failed");
    expect(
      container.querySelector('[data-testid="update-failure-banner"]')
    ).toBeNull();
  });

  it("renders a restart banner in the game menu (not just mid-run)", () => {
    mount("gameMenu");
    setUpdateStatus("ready");
    expect(
      container.querySelector('[data-testid="update-ready-banner"]')
    ).not.toBeNull();
  });
});
