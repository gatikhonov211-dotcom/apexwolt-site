// Коробка на сером фоне → коробка на белом (нейросеть путает белый картон с фоном). node tools/cutout-box.mjs <вход> <выход>
// Фон оценивается по краям кадра (для каждой строки — среднее слева и справа); пиксель — коробка, если заметно отличается от фона.
// Затем выпуклая оболочка найденных точек (коробка выпуклая) и исходные пиксели внутри неё на белом фоне.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const [inp, out] = process.argv.slice(2);
const input = await sharp(fs.readFileSync(inp)).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).removeAlpha().png().toBuffer();
const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
const E = Math.round(W * 0.02);
const fg = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  let bg = [0, 0, 0], n = 0;
  for (const x of [...Array(E).keys(), ...Array(E).keys()].map((k, i) => i < E ? k : W - 1 - k)) { const p = px(x, y); bg[0] += p[0]; bg[1] += p[1]; bg[2] += p[2]; n++; }
  bg = bg.map(v => v / n);
  for (let x = 0; x < W; x++) {
    const [r, g, b] = px(x, y);
    const d = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    fg[y * W + x] = d > 22 || chroma > 40 ? 1 : 0;
  }
}
// строки: самые левые/правые точки длинных отрезков (шум отсекаем — нужен отрезок не короче 1% ширины)
const pts = [], minRun = Math.round(W * 0.01);
for (let y = 0; y < H; y += 2) {
  let l = -1, r = -1, run = 0;
  for (let x = 0; x < W; x++) { run = fg[y * W + x] ? run + 1 : 0; if (run >= minRun) { if (l < 0) l = x - run + 1; r = x; } }
  if (l >= 0) pts.push([l, y], [r, y]);
}
pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const lo = [], up = [];
for (const p of pts) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
for (const p of [...pts].reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
const hull = [...lo.slice(0, -1), ...up.slice(0, -1)];
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><polygon points="${hull.map(p => p.join(',')).join(' ')}" fill="#fff"/></svg>`;
const mask = await sharp(Buffer.from(svg)).blur(0.8).extractChannel(0).toBuffer();
await sharp(await sharp(input).joinChannel(mask).png().toBuffer()).flatten({ background: '#ffffff' }).png().toFile(out);
const xs = hull.map(p => p[0]), ys = hull.map(p => p[1]);
console.log('ok', path.basename(out), `${W}x${H}`, 'box', Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
