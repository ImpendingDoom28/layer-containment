// Background update check: asks the service worker whether a newer version
// of the deployed game exists and, if so, lets it precache the new version in
// the background (the SW enforces a hard timeout and reports the outcome).
// The app then either reloads into the new version (once it's safe to do
// so) or shows a "couldn't update" banner; the retry happens on the next
// launch.

export type UpdateStatus =
  | "idle"
  | "checking"
  | "updating"
  | "ready"
  | "failed";

export type UpdateCheckResult =
  | { status: "up-to-date" }
  | { status: "update-ready" }
  | { status: "update-failed"; reason?: string };

// The message the app posts to the service worker; the SW replies with an
// UpdateCheckResult (see public/sw.js).
const CHECK_FOR_UPDATE_MESSAGE = { type: "check-for-update" } as const;

// The only env fact the check needs: the background update is
// production-only (the dev server rewrites on every save), mirroring the SW
// registration guard.
export type UpdateCheckEnv = { DEV: boolean };

const DEFAULT_TIMEOUT_MS = 60000;

const getRegistration = async (): Promise<ServiceWorkerRegistration | undefined> => {
  if (!("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration();
};

const getWorker = (
  registration: ServiceWorkerRegistration | undefined
): ServiceWorker | null =>
  registration ? (registration.active ?? registration.waiting ?? null) : null;

const waitForWorkerReady = async (): Promise<ServiceWorker | null> => {
  const worker = getWorker(await getRegistration());
  if (worker) return worker;
  // Registration (and thus activation) happens during page load; give it a
  // brief moment to land instead of racing it. `race` (not `all`) so a broken
  // registration that never resolves `ready` can't hang the check — the 500ms
  // cap always settles first in that case.
  const ready = await Promise.race<ServiceWorkerRegistration | undefined>([
    navigator.serviceWorker.ready.catch(
      (): ServiceWorkerRegistration | undefined => undefined
    ),
    new Promise<ServiceWorkerRegistration | undefined>((resolve) =>
      setTimeout(resolve, 500)
    ),
  ]);
  if (ready) return ready.active ?? null;
  return getWorker(await getRegistration());
};

// Replies from the service worker (via `Client.postMessage`) are delivered to
// the ServiceWorkerContainer in Chromium — not the ServiceWorker instance or
// the window — so both the container and the window are watched (the latter
// covers spec-conformant browsers). Only messages carrying one of the update
// statuses are acted on, so unrelated `postMessage` traffic is ignored.
const onReply = (settle: (result: UpdateCheckResult) => void) => (
  event: MessageEvent
) => {
  const data = event.data as { status?: string; reason?: string } | null;
  if (!data || typeof data.status !== "string") return;
  if (data.status === "up-to-date") settle({ status: "up-to-date" });
  else if (data.status === "update-ready") settle({ status: "update-ready" });
  else if (data.status === "update-failed") {
    settle({ status: "update-failed", reason: data.reason });
  }
};

const checkForUpdate = async (
  worker: ServiceWorker,
  timeoutMs: number
): Promise<UpdateCheckResult> =>
  new Promise((resolve) => {
    let settled = false;
    let onMessage: (event: MessageEvent) => void;
    const settle = (result: UpdateCheckResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("message", onMessage);
      resolve(result);
    };
    onMessage = onReply(settle);

    // Generous client-side ceiling: the SW enforces its own (hard) timeout
    // inside its 30s update budget and answers well before this.
    const timer = setTimeout(
      () => settle({ status: "update-failed", reason: "update-check-timeout" }),
      timeoutMs
    );

    navigator.serviceWorker.addEventListener("message", onMessage);
    window.addEventListener("message", onMessage);
    worker.postMessage(CHECK_FOR_UPDATE_MESSAGE);
  });

/**
 * Pings the service worker about a newer version and reports the outcome
 * through onResult. Resolves as soon as the check is done (or no update is
 * possible at all — no service worker support, dev build, non-secure origin,
 * or the SW never came up), with the result the UI should act on.
 */
export const runUpdateCheck = async (
  env: UpdateCheckEnv = import.meta.env,
  onResult?: (result: UpdateCheckResult) => void
): Promise<UpdateCheckResult> => {
  const isSupported =
    !env.DEV && typeof window !== "undefined" && window.isSecureContext;
  if (!isSupported || !("serviceWorker" in navigator)) {
    onResult?.({ status: "up-to-date" });
    return { status: "up-to-date" };
  }

  const worker = await waitForWorkerReady();
  if (!worker) {
    // No service worker (registration failed, or it never activated).
    onResult?.({ status: "up-to-date" });
    return { status: "up-to-date" };
  }

  const result = await checkForUpdate(worker, DEFAULT_TIMEOUT_MS);
  onResult?.(result);
  return result;
};
