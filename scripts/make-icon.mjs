// Renders build/icon.svg into a square build/icon.png (1024x1024).
// electron-builder uses this single PNG as the source for the per-platform
// icons (macOS .icns, Windows .ico, Linux .png), so there is nothing else to
// hand-author. Re-run after changing the icon: `node scripts/make-icon.mjs`.
//
// The icon is the game's brand mark (build/icon.svg). Keep it square with its
// own background tile so it reads on the OS taskbar / dock / start menu.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const input = path.join(root, "build", "icon.svg");
const outDir = path.join(root, "build");
const output = path.join(outDir, "icon.png");

const size = 1024;

mkdirSync(outDir, { recursive: true });

await sharp(input, { density: 300 })
  .resize(size, size)
  .png()
  .toFile(output);

console.log(`wrote ${path.relative(root, output)} (${size}x${size})`);
