// Generates the PWA icons (PNG) into public/. Run with: node scripts/gen-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// returns [r,g,b,a] for normalised coordinates (u,v in -0.5..0.5, content space)
function shade(u, v, py) {
  let col = Math.floor(py * 8) % 2 === 0 ? [46, 125, 59] : [51, 138, 65];
  const mix = (c, a) => (col = col.map((x, i) => x * (1 - a) + c[i] * a));
  const d = Math.hypot(u, v);
  if (Math.abs(d - 0.3) < 0.01 || (Math.abs(v) < 0.008 && Math.abs(u) < 0.5)) mix([255, 255, 255], 0.85);
  const ell = (cx, cy, rx, ry) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 < 1;
  if (ell(0, 0.36, 0.17, 0.085)) col = [47, 111, 224];
  if (ell(0, 0.36, 0.17, 0.085) && ell(0, 0.36, 0.1, 0.045)) col = [141, 182, 255];
  if (ell(0, -0.36, 0.17, 0.085)) col = [224, 67, 46];
  if (ell(0, -0.36, 0.17, 0.085) && ell(0, -0.36, 0.1, 0.045)) col = [255, 154, 133];
  if (d < 0.17) col = [30, 30, 30];
  if (d < 0.155) col = [255, 255, 255];
  if (d < 0.05) col = [30, 30, 30];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    if (Math.hypot(u - Math.cos(a) * 0.105, v - Math.sin(a) * 0.105) < 0.025) col = [30, 30, 30];
  }
  return col;
}

function render(S, maskable) {
  const out = Buffer.alloc(S * S * 4);
  const SS = 3;
  const k = maskable ? 0.78 : 1;
  const radius = 0.18;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / S;
          const py = (y + (sy + 0.5) / SS) / S;
          let inside = true;
          if (!maskable) {
            const qx = Math.abs(px - 0.5) - (0.5 - radius);
            const qy = Math.abs(py - 0.5) - (0.5 - radius);
            inside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) <= radius;
          }
          if (!inside) continue;
          const [cr, cg, cb] = shade((px - 0.5) / k, (py - 0.5) / k, py);
          r += cr; g += cg; b += cb; a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * S + x) * 4;
      const cov = a / 255;
      out[i] = cov ? r / cov : 0;
      out[i + 1] = cov ? g / cov : 0;
      out[i + 2] = cov ? b / cov : 0;
      out[i + 3] = Math.round(a / n);
    }
  }
  return out;
}

const jobs = [
  ['public/icon-192.png', 192, false],
  ['public/icon-512.png', 512, false],
  ['public/icon-maskable-512.png', 512, true],
  ['public/apple-touch-icon.png', 180, true],
];
for (const [file, size, maskable] of jobs) {
  fs.writeFileSync(file, png(size, size, render(size, maskable)));
  console.log('wrote', file);
}
fs.writeFileSync(
  'public/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#2e7d3b"/><circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width="1.6" opacity=".85"/><rect x="0" y="49.2" width="100" height="1.6" fill="#fff" opacity=".85"/><ellipse cx="50" cy="86" rx="17" ry="8.5" fill="#2f6fe0"/><ellipse cx="50" cy="14" rx="17" ry="8.5" fill="#e0432e"/><circle cx="50" cy="50" r="17" fill="#1e1e1e"/><circle cx="50" cy="50" r="15.5" fill="#fff"/><circle cx="50" cy="50" r="5" fill="#1e1e1e"/></svg>\n`,
);
console.log('wrote public/icon.svg');
