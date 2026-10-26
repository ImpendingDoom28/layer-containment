import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canRegisterServiceWorker,
  registerServiceWorker,
} from "./registerServiceWorker";

type Env = { DEV: boolean; BASE_URL: string };

type DocumentStub = {
  readyState: "complete" | "loading";
  addEventListener: Mock;
};

type GlobalStubs = {
  window: { isSecureContext: boolean };
  navigator: { serviceWorker?: { register: Mock } };
  document: DocumentStub;
};

const createEnv = (overrides: Partial<Env> = {}): Env => ({
  DEV: false,
  BASE_URL: "./",
  ...overrides,
});

// The module reads the real Vite env; the test asserts against the same
// base so the expected URL matches whatever base the environment uses.
const SW_URL = `${import.meta.env.BASE_URL}sw.js`;

const createStubs = (overrides: Partial<GlobalStubs> = {}): GlobalStubs => ({
  window: { isSecureContext: true },
  navigator: { serviceWorker: { register: vi.fn(() => Promise.resolve({})) } },
  document: { readyState: "complete", addEventListener: vi.fn() },
  ...overrides,
});

const installGlobals = (stubs: GlobalStubs) => {
  for (const [name, value] of Object.entries(stubs)) {
    // Node defines `navigator` as a getter-only global, so a plain
    // assignment throws; defineProperty works for both cases.
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
};

const clearGlobals = () => {
  for (const name of ["window", "navigator", "document"]) {
    delete (globalThis as Record<string, unknown>)[name];
  }
};

describe("canRegisterServiceWorker", () => {
  afterEach(clearGlobals);

  it("disables registration in development builds", () => {
    installGlobals(createStubs());
    expect(canRegisterServiceWorker(createEnv({ DEV: true }))).toBe(false);
  });

  it("disables registration on insecure origins", () => {
    installGlobals(createStubs({ window: { isSecureContext: false } }));
    expect(canRegisterServiceWorker(createEnv())).toBe(false);
  });

  it("allows registration in production on a secure origin", () => {
    installGlobals(createStubs());
    expect(canRegisterServiceWorker(createEnv())).toBe(true);
  });
});

describe("registerServiceWorker", () => {
  let stubs: GlobalStubs;

  beforeEach(() => {
    stubs = createStubs();
    installGlobals(stubs);
  });

  afterEach(clearGlobals);

  it("skips registration in development builds", () => {
    registerServiceWorker(createEnv({ DEV: true }));
    expect(stubs.navigator.serviceWorker?.register).not.toHaveBeenCalled();
    expect(stubs.document.addEventListener).not.toHaveBeenCalled();
  });

  it("skips registration when the browser has no service worker support", () => {
    stubs = createStubs({ navigator: {} });
    installGlobals(stubs);
    expect(() => registerServiceWorker(createEnv())).not.toThrow();
    expect(stubs.document.addEventListener).not.toHaveBeenCalled();
  });

  it("registers immediately when the document is complete", () => {
    registerServiceWorker(createEnv());
    expect(stubs.navigator.serviceWorker?.register).toHaveBeenCalledTimes(1);
    expect(stubs.navigator.serviceWorker?.register).toHaveBeenCalledWith(
      SW_URL
    );
    expect(stubs.document.addEventListener).not.toHaveBeenCalled();
  });

  it("defers registration until DOMContentLoaded while the document is loading", () => {
    stubs.document.readyState = "loading";
    registerServiceWorker(createEnv());
    expect(stubs.navigator.serviceWorker?.register).not.toHaveBeenCalled();
    expect(stubs.document.addEventListener).toHaveBeenCalledWith(
      "DOMContentLoaded",
      expect.any(Function),
      { once: true }
    );

    const handler = stubs.document.addEventListener.mock
      .calls[0][1] as () => void;
    handler();
    expect(stubs.navigator.serviceWorker?.register).toHaveBeenCalledWith(
      SW_URL
    );
  });

  it("survives a rejected registration", () => {
    stubs = createStubs({
      navigator: {
        serviceWorker: {
          register: vi.fn(() => Promise.reject(new Error("denied"))),
        },
      },
    });
    installGlobals(stubs);
    expect(() => registerServiceWorker(createEnv())).not.toThrow();
  });
});
