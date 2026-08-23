/**
 * Writes Chalk's PWA icons as plain PNGs from the favicon's geometry — the
 * ink square with the white play-forward mark — so the repository carries no
 * binary that cannot be regenerated. Run: bun scripts/make-pwa-icons.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const outDir = fileURLToPath(
  new URL("../apps/web/public/icons/", import.meta.url),
);

const INK = [0x17, 0x17, 0x17] as const;
const WHITE = [0xff, 0xff, 0xff] as const;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array) => {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const body = new Uint8Array(type.length + data.length);
  body.set(new TextEncoder().encode(type));
  body.set(data, type.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(body));
  return new Uint8Array([...length, ...body, ...crc]);
};

/** Point-in-triangle for the play mark; the favicon's 12,9.5 → 23,16 → 12,22.5 on a 32 grid. */
const inMark = (x: number, y: number, size: number) => {
  const s = size / 32;
  const [ax, ay, bx, by, cx, cy] = [
    12 * s,
    9.5 * s,
    23 * s,
    16 * s,
    12 * s,
    22.5 * s,
  ];
  const sign = (
    px: number,
    py: number,
    qx: number,
    qy: number,
    rx: number,
    ry: number,
  ) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = sign(x, y, ax, ay, bx, by);
  const d2 = sign(x, y, bx, by, cx, cy);
  const d3 = sign(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

const inRoundedSquare = (
  x: number,
  y: number,
  size: number,
  radius: number,
) => {
  const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
  const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
  return dx * dx + dy * dy <= radius * radius;
};

function png(size: number, maskable: boolean): Uint8Array {
  const raw = new Uint8Array(size * (size * 4 + 1));
  const radius = maskable ? 0 : size * (7 / 32);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const inside = inRoundedSquare(x + 0.5, y + 0.5, size, radius);
      // Maskable icons keep the mark inside the safe zone (80% of the square).
      const markSize = maskable ? size * 0.8 : size;
      const offset = (size - markSize) / 2;
      const mark = inMark(x + 0.5 - offset, y + 0.5 - offset, markSize);
      const color = mark ? WHITE : INK;
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
      raw[i + 3] = inside ? 255 : 0;
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", header),
    ...chunk("IDAT", new Uint8Array(deflateSync(raw))),
    ...chunk("IEND", new Uint8Array()),
  ]);
}

await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}icon-192.png`, png(192, false));
await writeFile(`${outDir}icon-512.png`, png(512, false));
await writeFile(`${outDir}icon-maskable-512.png`, png(512, true));
console.log(`wrote 3 icons to ${outDir}`);
