/**
 * Regenerates the static SVG icon assets in src/components/ui/assets/icons
 * from the icon node data of the installed lucide-react package.
 *
 * The app renders icons through <img> (src/components/ui/Icon.tsx), so these
 * files are the single source of truth for the icons. Run this script when
 * adding or replacing an icon:
 *
 *   node scripts/generate-icon-svgs.mjs
 *
 * <img>-loaded SVGs cannot inherit the page's text color (currentColor
 * resolves to black in an <img>), so every variant bakes its stroke color in.
 * Each icon ships a white (foreground) base file plus one file per additional
 * color it is used in (COLOR_VARIANTS).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "src/components/ui/assets/icons");

// Worktrees share no node_modules with the main checkout, so walk up the
// parent directories until the installed lucide-react is found.
const findPackage = (dir, name) => {
  for (let cursor = dir; ; cursor = path.dirname(cursor)) {
    const candidate = path.join(cursor, "node_modules", name);
    if (existsSync(candidate)) return candidate;
    if (path.dirname(cursor) === cursor) return null;
  }
};

const lucideDir = findPackage(repoRoot, "lucide-react");
if (!lucideDir) {
  throw new Error(
    "lucide-react not found in any parent node_modules — run `npm install` first"
  );
}

/**
 * PascalCase icon name -> lucide icon file (dist/esm/icons/<file>.js).
 */
const ICONS = {
  AlertCircle: "alert-circle",
  AlertTriangle: "alert-triangle",
  ArrowLeft: "arrow-left",
  ArrowRight: "arrow-right",
  Box: "box",
  Check: "check",
  CheckCircle2: "check-circle-2",
  ChevronDown: "chevron-down",
  ChevronLeft: "chevron-left",
  ChevronRight: "chevron-right",
  ChevronUp: "chevron-up",
  Crosshair: "crosshair",
  DollarSign: "dollar-sign",
  Download: "download",
  Droplets: "droplets",
  Eraser: "eraser",
  FileUp: "file-up",
  Gauge: "gauge",
  GitBranch: "git-branch",
  Heart: "heart",
  HeartPulse: "heart-pulse",
  Keyboard: "keyboard",
  Menu: "menu",
  MousePointer2: "mouse-pointer-2",
  Pencil: "pencil",
  Play: "play",
  Plus: "plus",
  Radar: "radar",
  Radio: "radio",
  Route: "route",
  Shield: "shield",
  Skull: "skull",
  Snowflake: "snowflake",
  Trash2: "trash-2",
  Users: "users",
  Volume2: "volume-2",
  VolumeX: "volume-x",
  Waves: "waves",
  Wind: "wind",
  X: "x",
  Zap: "zap",
};

/**
 * Extra color variants per icon, beyond the white (foreground) base. The key
 * is the value of the `color` prop on <Icon />; see COLOR_HEX for the mapping.
 */
const COLOR_VARIANTS = {
  AlertCircle: ["amber"],
  AlertTriangle: ["destructive"],
  ArrowRight: ["muted"],
  CheckCircle2: ["emerald"],
  ChevronDown: ["muted"],
  ChevronUp: ["muted"],
  Crosshair: ["primary70"],
  DollarSign: ["green"],
  Gauge: ["orange"],
  Heart: ["muted"],
  HeartPulse: ["green", "yellow", "red"],
  Keyboard: ["primary"],
  Pencil: ["muted"],
  Radar: ["primary70"],
  Radio: ["primary", "primary70"],
  Shield: ["muted"],
  Skull: ["red3"],
  Snowflake: ["primary70"],
  Trash2: ["destructive"],
  Users: ["muted"],
  VolumeX: ["destructive"],
  Waves: ["primary70"],
  Wind: ["muted"],
  X: ["destructive"],
  Zap: ["muted", "yellow", "primary70"],
};

const COLOR_HEX = {
  // muted-foreground
  muted: "#B3B3B3",
  primary: "#FF6900",
  // primary at 70% opacity (text-primary/70)
  primary70: "#FF6900B3",
  destructive: "#FF6467",
  green: "#4ADE80",
  yellow: "#FACC15",
  red: "#F87171",
  red3: "#FCA5A5",
  orange: "#FB923C",
  amber: "#FBBF24",
  emerald: "#34D399",
};
const FOREGROUND_HEX = "#FAFAFA";

/**
 * Icons that are not in lucide (custom, fill-based). Their SVG content is
 * owned by this script so the icons directory stays fully regeneratable.
 * The base file uses the foreground fill; `CUSTOM_ICON_VARIANTS` lists the
 * extra colors to emit (the fill hex is swapped per variant).
 */
const CUSTOM_ICONS = {
  Pause: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FAFAFA" stroke="none"><rect x="5" y="4" width="5.5" height="16" rx="1" /><rect x="13.5" y="4" width="5.5" height="16" rx="1" /></svg>`,
  Github: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FAFAFA" stroke="none"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.111.825-.261.825-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.466-1.332-5.466-5.93 0-1.31.468-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.31 24 12c0-6.63-5.37-12-12-12z" /></svg>`,
};

const CUSTOM_ICON_VARIANTS = {
  Github: ["primary", "muted"],
};

const attrValue = (value) =>
  typeof value === "string" ? value.replaceAll('"', "&quot;") : String(value);

const renderElement = ([tag, attrs]) => {
  const rendered = Object.entries(attrs)
    .filter(([key]) => key !== "key")
    .map(([key, value]) => `${key}="${attrValue(value)}"`)
    .join(" ");
  return `<${tag} ${rendered} />`;
};

const iconFileUrl = (relativePath) =>
  pathToFileURL(path.join(lucideDir, "dist/esm/icons", relativePath)).href;

// Some icons are aliases that re-export a canonical icon (e.g.
// alert-circle -> circle-alert); follow the chain until the module carries
// the __iconNode data.
const resolveIconModule = async (file) => {
  let current = `${file}.js`;
  for (let depth = 0; depth < 5; depth += 1) {
    const source = readFileSync(
      path.join(lucideDir, "dist/esm/icons", current),
      "utf8"
    );
    const alias = source.match(/export \{ default \} from '\.\/([^']+)';/);
    if (!alias) {
      return import(iconFileUrl(current));
    }
    current = alias[1];
  }
  throw new Error(`Unresolvable alias chain starting at ${file}.js`);
};

const buildSvg = (iconNode, strokeColor) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconNode
    .map(renderElement)
    .join("")}</svg>\n`;

mkdirSync(outDir, { recursive: true });

let count = 0;
for (const [name, file] of Object.entries(ICONS)) {
  const module = await resolveIconModule(file);
  const svg = buildSvg(module.__iconNode, FOREGROUND_HEX);
  writeFileSync(path.join(outDir, `${name}.svg`), svg);
  count += 1;

  for (const color of COLOR_VARIANTS[name] ?? []) {
    const colored = buildSvg(module.__iconNode, COLOR_HEX[color]);
    writeFileSync(path.join(outDir, `${name}-${color}.svg`), colored);
    count += 1;
  }
}

for (const [name, svg] of Object.entries(CUSTOM_ICONS)) {
  writeFileSync(path.join(outDir, `${name}.svg`), `${svg}\n`);
  count += 1;

  for (const color of CUSTOM_ICON_VARIANTS[name] ?? []) {
    const colored = svg.replace(/fill="#FAFAFA"/g, `fill="${COLOR_HEX[color]}"`);
    writeFileSync(path.join(outDir, `${name}-${color}.svg`), `${colored}\n`);
    count += 1;
  }
}

console.log(`Wrote ${count} icon variants to ${outDir}`);
