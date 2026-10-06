// Renders the PWA icons from public/favicon.svg. Run once: node scripts/make-icons.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url));
const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(svg, { density: 1200 }).resize(size, size).png().toFile(out(name));
}
// Maskable: the art inside the 80% safe zone on a full-bleed dark square.
const inner = await sharp(svg, { density: 1200 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0b0b0c" } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile(out("icon-maskable-512.png"));
console.log("icons written");
