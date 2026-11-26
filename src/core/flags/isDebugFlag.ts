/**
 * The `?m=debug` URL flag.
 *
 * A query string is part of the URL, not the build, so a single build —
 * dev or production — carries the flag: appending `?m=debug` to any URL
 * (dev server or a deployed production build) enables the developer entry
 * points that are otherwise hidden (the main-menu "Stress Test" button). The
 * flag is read once at boot from the location hash/search, so it works in
 * both the browser router and the Electron app's loopback origin.
 */
const readDebugFlag = (): boolean => {
  try {
    if (typeof window === "undefined") return false;
    // The router uses the hash for routes in the packaged app, so the flag
    // can sit in either the query string or the hash.
    const flags = new URLSearchParams(window.location.search);
    return (
      flags.get("m") === "debug" ||
      window.location.hash.includes("m=debug")
    );
  } catch {
    return false;
  }
};

export const isDebugFlag = readDebugFlag();
