// Готовит фото товаров для сайта: WebP до 1200 px, светло-серый студийный фон → чисто белый.
// Запуск: npm install && node tools/process-photos.mjs <папка выгрузки> [source]
// source — какие модели из photo-map.json обрабатывать (apex | heat); без него — все.
// Порядок в галерее: сначала рендер модели (PNG с названием), затем фото 1, 2, 3…, затем остальное.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(src)) throw new Error('Укажите папку с выгрузкой фото');
const { models } = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'photo-map.json'), 'utf8'));
const outRoot = path.join(root, 'assets', 'img', 'products');
const MAX = 1200;

// Фон у снимков разный (студийный серый, виньетка), поэтому его яркость меряем по краям кадра.
// Осветляем только фон: нейтральные светлые пиксели, связанные с краями кадра (заливка от рамки).
// Белый пластик инструмента окружён тёмным контуром, заливка до него не доходит — без засветов.
const whiten = (data, width, height, channels) => {
  const lum = i => (data[i] + data[i + 1] + data[i + 2]) / 3;
  const edge = [];
  const band = Math.max(4, Math.round(Math.min(width, height) * 0.03));
  for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) {
    if (x > band && x < width - band && y > band && y < height - band) continue;
    edge.push(lum((y * width + x) * channels));
  }
  edge.sort((a, b) => a - b);
  const p10 = edge[Math.floor(edge.length * 0.1)];
  const p60 = edge[Math.floor(edge.length * 0.6)];
  const p95 = edge[Math.floor(edge.length * 0.95)];
  if (p10 < 150) return data; // тёмный или цветной фон (например, фото кейса в интерьере) — не трогаем
  // Пластик защищён условием «не светлее фона» (hi), поэтому фон доводим до белого уже на p10 + 8.
  const from = p10 - 20, to = Math.min(250, from + 28);
  const hi = Math.min(252, p95 + 6);
  const isBg = p => {
    const i = p * channels, r = data[i], g = data[i + 1], b = data[i + 2];
    const l = (r + g + b) / 3;
    // Светлее самого фона — это белый пластик/блики инструмента, их не трогаем.
    return Math.max(r, g, b) - Math.min(r, g, b) <= 26 && l > from && l <= hi;
  };
  const bg = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const seed = p => { if (!bg[p] && isBg(p)) { bg[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % width;
    if (x > 0) seed(p - 1);
    if (x < width - 1) seed(p + 1);
    if (p >= width) seed(p - width);
    if (p < width * (height - 1)) seed(p + width);
  }
  for (let p = 0; p < bg.length; p++) {
    if (!bg[p]) continue;
    const i = p * channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = (r + g + b) / 3;
    const t = Math.min(1, (l - from) / (to - from));
    const k = t * t * (3 - 2 * t);
    data[i] = r + (255 - r) * k;
    data[i + 1] = g + (255 - g) * k;
    data[i + 2] = b + (255 - b) * k;
  }
  return data;
};

const order = (a, b) => {
  const rank = n => /^\d+\.\w+$/.test(n) ? 1 : /\.png$/i.test(n) && !/^(chatgpt|без названия|дизайн)/i.test(n) && !/^[0-9a-f-]{20,}/i.test(n) ? 0 : 2;
  return rank(a) - rank(b) || parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b, 'ru');
};

const only = process.argv[3];
for (const m of models.filter(x => !only || x.source === only)) {
  const dir = path.join(src, ...m.dir.split('/'));
  if (!fs.existsSync(dir)) { console.warn(`нет папки: ${m.dir}`); continue; }
  const out = path.join(outRoot, m.slug);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const seen = new Set();
  const names = fs.readdirSync(dir).filter(n => /\.(jpe?g|png|webp)$/i.test(n)).sort(order);
  // lead в photo-map.json — какой снимок поставить главным (например, сам прибор вместо коробки).
  if (m.lead && names.includes(m.lead)) names.unshift(...names.splice(names.indexOf(m.lead), 1));
  let n = 0;
  for (const name of names) {
    const buf = fs.readFileSync(path.join(dir, name));
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    const { data, info } = await sharp(buf).rotate().flatten({ background: '#ffffff' })
      .resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb').removeAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
    n++;
    await sharp(whiten(data, info.width, info.height, info.channels), { raw: { width: info.width, height: info.height, channels: info.channels } })
      .webp({ quality: 80 }).toFile(path.join(out, `${String(n).padStart(2, '0')}.webp`));
  }
  console.log(`${m.slug}: ${n} фото`);
}
