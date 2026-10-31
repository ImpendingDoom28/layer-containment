import { type FC } from "react";

import { cn } from "./lib/twUtils";

// Static SVG icon assets, bundled by Vite (as data URLs or emitted files,
// depending on size) and referenced by file name — see scripts/
// generate-icon-svgs.mjs for the icon list and regeneration.
const iconAssets = import.meta.glob("./assets/icons/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const iconUrl = (name: string, color?: IconColor) => {
  const file = color ? `${name}-${color}.svg` : `${name}.svg`;
  const url = iconAssets[`./assets/icons/${file}`];
  if (!url) {
    throw new Error(
      `Unknown icon "${file}" — add it to scripts/generate-icon-svgs.mjs and regenerate`
    );
  }
  return url;
};

/**
 * Icon names available in src/components/ui/assets/icons (see scripts/
 * generate-icon-svgs.mjs).
 */
export type IconName = keyof typeof ICON_NAMES;

/**
 * Colors an icon can be rendered in. The default (no color) is the foreground
 * (white) variant; any other value selects the matching pre-colored variant
 * file. <img>-loaded SVGs cannot inherit text color, so each color is a
 * separate asset.
 */
export type IconColor =
  | "primary"
  | "primary70"
  | "destructive"
  | "green"
  | "yellow"
  | "red"
  | "red3"
  | "orange"
  | "amber"
  | "emerald"
  | "muted";

const ICON_NAMES = {
  AlertCircle: 1,
  AlertTriangle: 1,
  ArrowLeft: 1,
  ArrowRight: 1,
  Box: 1,
  Check: 1,
  CheckCircle2: 1,
  ChevronDown: 1,
  ChevronLeft: 1,
  ChevronRight: 1,
  ChevronUp: 1,
  Crosshair: 1,
  DollarSign: 1,
  Download: 1,
  Droplets: 1,
  Eraser: 1,
  FileUp: 1,
  Gauge: 1,
  GitBranch: 1,
  Heart: 1,
  HeartPulse: 1,
  Keyboard: 1,
  Menu: 1,
  MousePointer2: 1,
  Pencil: 1,
  Pause: 1,
  Play: 1,
  Plus: 1,
  Radar: 1,
  Radio: 1,
  Route: 1,
  Shield: 1,
  Skull: 1,
  Snowflake: 1,
  Trash2: 1,
  Users: 1,
  Volume2: 1,
  VolumeX: 1,
  Waves: 1,
  Wind: 1,
  X: 1,
  Zap: 1,
  Github: 1,
} as const;

type IconProps = {
  name: IconName;
  /**
   * Color of the icon. Omit for the foreground (white) variant.
   */
  color?: IconColor;
  /**
   * Rendered size in px (width and height). Defaults to 24 — lucide's
   * default icon size.
   */
  size?: number;
  className?: string;
};

/**
 * Renders a static SVG icon through an <img> tag instead of a React SVG
 * component. The icon file is the single source of truth (see scripts/
 * generate-icon-svgs.mjs), so this only mounts an <img> — no per-icon React
 * component, no re-render cost on state changes, and small files are inlined
 * as data URLs by Vite (zero extra requests).
 *
 * @example
 *   <Icon name="Zap" color="yellow" size={16} />
 */
export const Icon: FC<IconProps> = ({
  name,
  color,
  // 24px — the size lucide's icon components defaulted to, matching the old
  // bare <Icon /> usages.
  size = 24,
  className,
}) => (
  <img
    src={iconUrl(name, color)}
    width={size}
    height={size}
    alt=""
    aria-hidden
    className={cn("shrink-0 select-none", className)}
  />
);
