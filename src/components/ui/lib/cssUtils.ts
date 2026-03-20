const colorTokenMap = {
  primary: "--primary-hex",
  destructive: "--destructive-hex",

  "scene-black": "--scene-black",
  "scene-white": "--scene-white",
  "scene-gray-200": "--scene-gray-200",
  "scene-gray-300": "--scene-gray-300",
  "scene-gray-500": "--scene-gray-500",
  "scene-gray-600": "--scene-gray-600",
  "scene-gray-700": "--scene-gray-700",
  "scene-gray-800": "--scene-gray-800",
  "scene-portal": "--scene-portal",
  "scene-portal-glow": "--scene-portal-glow",
  "scene-hp-high": "--scene-hp-high",
  "scene-hp-medium": "--scene-hp-medium",
  "scene-hp-low": "--scene-hp-low",
  "scene-slow": "--scene-slow",
  "scene-building-warning": "--scene-building-warning",
  "scene-sky-base": "--scene-sky-base",

  "editor-tool-select": "--editor-tool-select",
  "editor-tool-place-building": "--editor-tool-place-building",
  "editor-tool-draw-path": "--editor-tool-draw-path",
  "editor-tool-set-spawn": "--editor-tool-set-spawn",
  "editor-tool-set-base": "--editor-tool-set-base",
  "editor-tool-erase": "--editor-tool-erase",
  "editor-indicator-selected": "--editor-indicator-selected",
  "editor-indicator-edge": "--editor-indicator-edge",
  "editor-indicator-path": "--editor-indicator-path",
  "editor-indicator-idle": "--editor-indicator-idle",
  "editor-path-active": "--editor-path-active",
  "editor-path-active-border": "--editor-path-active-border",
  "editor-can-place": "--editor-can-place",
  "editor-default-tile": "--editor-default-tile",
  "editor-default-ground": "--editor-default-ground",
  "editor-default-building": "--editor-default-building",
} as const;

export type ColorToken = keyof typeof colorTokenMap;

const cache = new Map<string, string>();

/** Reads a hex color from a CSS custom property. Must run in the browser. */
export const getCssColorValue = (name: ColorToken): string => {
  const cached = cache.get(name);
  if (cached) return cached;

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(colorTokenMap[name])
    .trim();
  cache.set(name, value);
  return value;
};
