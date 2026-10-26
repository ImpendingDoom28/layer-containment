// Registers the PWA service worker. Only on secure origins (https or
// localhost, where the browser allows service workers) and only in
// production builds — the dev server rewrites on every save, so a service
// worker there would keep serving stale chunks.
const SW_URL = `${import.meta.env.BASE_URL}sw.js`;

export const canRegisterServiceWorker = (env = import.meta.env): boolean =>
  !env.DEV && typeof window !== "undefined" && window.isSecureContext;

export const registerServiceWorker = (env = import.meta.env): void => {
  if (!canRegisterServiceWorker(env)) return;
  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register(SW_URL)
      .catch((error: unknown) =>
        console.warn("Service worker registration failed", error)
      );
  };

  if (document.readyState === "complete") {
    register();
    return;
  }
  document.addEventListener("DOMContentLoaded", register, { once: true });
};
