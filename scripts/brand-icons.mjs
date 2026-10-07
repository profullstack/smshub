#!/usr/bin/env node
// Render a brand's PWA icons and social card from its SVGs.
//   node scripts/brand-icons.mjs numberstation
// Reads public/brands/<id>/{icon,og}.svg, writes the PNGs beside them.
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

const id = process.argv[2];
if (!id) {
  console.error("usage: node scripts/brand-icons.mjs <brand-id>");
  process.exit(1);
}
const dir = path.join(process.cwd(), "public", "brands", id);
const icon = await readFile(path.join(dir, "icon.svg"));

const sizes = { "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 };
for (const [name, size] of Object.entries(sizes)) {
  await sharp(icon, { density: 600 }).resize(size, size).png().toFile(path.join(dir, name));
  console.log(name);
}

// Maskable: full-bleed background so launchers can crop to any shape.
await sharp(icon, { density: 600 })
  .resize(410, 410)
  .flatten({ background: "#0b0a08" })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#0b0a08" })
  .png()
  .toFile(path.join(dir, "icon-maskable-512.png"));
console.log("icon-maskable-512.png");

await sharp(await readFile(path.join(dir, "og.svg"))).png().toFile(path.join(dir, "og.png"));
console.log("og.png");
