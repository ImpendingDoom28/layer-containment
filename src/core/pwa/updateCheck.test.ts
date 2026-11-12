import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runUpdateCheck,
  type UpdateCheckEnv,
  type UpdateCheckResult,
} from "./updateCheck";

// The production env the app runs the check with (vitest's own
// import.meta.env is a dev env, so it must be passed explicitly).
const PROD_ENV: UpdateCheckEnv = { DEV: false };

// A minimal event target that only tracks "message" listeners, so the fake
// ServiceWorkerContainer / window can be fed replies and asserted on.
const createEventTarget = () => {
  const messageListeners = new Set<(e: { data: unknown }) => void>();
  return {
    addEventListener: (type: string, fn: (e: { data: unknown }) => void) => {
      if (type === "message") messageListeners.add(fn);
    },
    removeEventListener: (type: string, fn: (e: { data: unknown }) => void) => {
      if (type === "message") messageListeners.delete(fn);
    },
    dispatch: (data: unknown) => {
      for (const fn of [...messageListeners]) fn({ data });
    },
  };
};

type Container = ReturnType<typeof createEventTarget> & {
  ready: Promise<unknown>;
  getRegistration: ReturnType<typeof vi.fn>;
};
type WindowTarget = ReturnType<typeof createEventTarget> & {
  isSecureContext: boolean;
};

type BuildOptions = {
  reply?: UpdateCheckResult | null;
  customPost?: (dispatch: (data: unknown) => void) => void;
  // Simulates "no registration at all": `ready` never resolves and
  // `getRegistration` resolves to `undefined` (the worker was never
  // activated). Absent by default (a fresh registration with the fake worker).
  noRegistration?: boolean;
  ready?: Promise<unknown>;
  isSecureContext?: boolean;
  noServiceWorker?: boolean;
};

// Builds a fake service worker whose postMessage routes the reply to the
// ServiceWorkerContainer (Chromium delivers Client.postMessage replies on the
// container, not the ServiceWorker instance or the window), and installs the
// matching navigator/window globals.
const build = (options: BuildOptions = {}) => {
  const container = createEventTarget() as Container;
  const windowTarget = createEventTarget() as WindowTarget;

  let postMessageImpl: (message: unknown) => void = (message: unknown) => {
    void message;
  };
  if (options.customPost) {
    postMessageImpl = (message: unknown) => {
      void message;
      queueMicrotask(() => options.customPost!(container.dispatch));
    };
  } else if (options.reply) {
    postMessageImpl = (message: unknown) => {
      void message;
      queueMicrotask(() => container.dispatch(options.reply));
    };
  }
  const worker = { postMessage: vi.fn(postMessageImpl) };

  const registrationValue = options.noRegistration
    ? undefined
    : { active: worker };
  const readyValue = options.noRegistration
    ? new Promise(() => {
        /* never resolves — the worker never activated */
      })
    : options.ready ?? Promise.resolve({ active: worker });

  container.ready = readyValue;
  container.getRegistration = vi.fn().mockResolvedValue(registrationValue);
  windowTarget.isSecureContext = options.isSecureContext ?? true;

  Object.defineProperty(globalThis, "navigator", {
    value: options.noServiceWorker ? {} : { serviceWorker: container },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: windowTarget,
    configurable: true,
    writable: true,
  });

  return { worker, container, postMessage: worker.postMessage };
};

const clearGlobals = (): void => {
  delete (globalThis as Record<string, unknown>)["navigator"];
  delete (globalThis as Record<string, unknown>)["window"];
};

afterEach(() => {
  clearGlobals();
  vi.useRealTimers();
});

describe("runUpdateCheck", () => {
  it("is a no-op in dev builds (reports up-to-date without touching the SW)", async () => {
    const onResult = vi.fn();
    const result = await runUpdateCheck({ DEV: true }, onResult);

    expect(result).toEqual({ status: "up-to-date" });
    expect(onResult).toHaveBeenCalledWith({ status: "up-to-date" });
  });

  it("is a no-op on insecure origins", async () => {
    build({ isSecureContext: false });

    const result = await runUpdateCheck(PROD_ENV);
    expect(result).toEqual({ status: "up-to-date" });
  });

  it("reports up-to-date when the service worker says so", async () => {
    build({ reply: { status: "up-to-date" } });

    const result = await runUpdateCheck(PROD_ENV);
    expect(result).toEqual({ status: "up-to-date" });
  });

  it("reports update-ready when a new version is fully cached", async () => {
    const { postMessage } = build({ reply: { status: "update-ready" } });

    const result = await runUpdateCheck(PROD_ENV);
    expect(result).toEqual({ status: "update-ready" });
    // The app pings the SW with the agreed message.
    expect(postMessage).toHaveBeenCalledWith({ type: "check-for-update" });
  });

  it("reports update-failed when the background precache fails", async () => {
    build({ reply: { status: "update-failed", reason: "timeout" } });

    const result = await runUpdateCheck(PROD_ENV);
    expect(result).toEqual({ status: "update-failed", reason: "timeout" });
  });

  it("treats a missing service worker as up-to-date (nothing to update)", async () => {
    build({ noRegistration: true });

    const result = await runUpdateCheck(PROD_ENV);
    expect(result).toEqual({ status: "up-to-date" });
  });

  it("reports a failure when the SW never answers", async () => {
    vi.useFakeTimers();
    build({ reply: null });

    const promise = runUpdateCheck(PROD_ENV);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.status).toBe("update-failed");
  });

  it("ignores unrelated messages from the worker", async () => {
    build({
      customPost: (dispatch) => {
        dispatch({ type: "unrelated" });
        queueMicrotask(() => dispatch({ status: "update-ready" }));
      },
    });

    const result = await runUpdateCheck(PROD_ENV);
    expect(result).toEqual({ status: "update-ready" });
  });
});
