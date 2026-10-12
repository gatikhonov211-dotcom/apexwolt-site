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
// Нейтральные пиксели от «чуть темнее фона» и светлее плавно доводим до белого; цветные и тёмные не трогаем.
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
  if (p10 < 150) return data; // тёмный или цветной фон (например, фото кейса в интерьере) — не трогаем
  const from = p10 - 20, to = Math.min(250, Math.max(p60, from + 12));
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 26) continue;
    const l = (r + g + b) / 3;
    if (l <= from) continue;
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
