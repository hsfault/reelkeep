import { readFile } from "node:fs/promises";
import sharp from "sharp";

const jobs = [
  ["public/icon.svg", "public/icon-192.png", 192],
  ["public/icon.svg", "public/icon-512.png", 512],
  ["public/icon-maskable.svg", "public/icon-maskable-512.png", 512],
  ["public/icon-maskable.svg", "public/apple-touch-icon.png", 180],
];

for (const [src, out, size] of jobs) {
  const svg = await readFile(src);
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
  console.log("created", out);
}