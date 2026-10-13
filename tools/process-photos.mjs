// Готовит фото товаров для сайта: WebP до 1200 px, качество 88, без изменения цветов и фона.
// Запуск: npm install && node tools/process-photos.mjs <папка выгрузки> [source] [папка исходников]
// source — какие модели из photo-map.json обрабатывать (apex | heat); без него — все.
// Порядок в галерее: сначала рендер модели (PNG с названием), затем фото 1, 2, 3…, затем остальное.
// Цвета и фон не меняются: снимки с Диска ставятся как есть.
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

const order = (a, b) => {
  const rank = n => /^\d+\.\w+$/.test(n) ? 1 : /\.png$/i.test(n) && !/^(chatgpt|без названия|дизайн)/i.test(n) && !/^[0-9a-f-]{20,}/i.test(n) ? 0 : 2;
  return rank(a) - rank(b) || parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b, 'ru');
};

const only = process.argv[3];
// Четвёртый аргумент — папка исходников (без вырезки фона), если первая папка — результат cutout-photos.mjs.
const originalsRoot = process.argv[4] ? path.resolve(process.argv[4]) : null;
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
  let unique = [];
  for (const name of names) {
    const buf = fs.readFileSync(path.join(dir, name));
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    unique.push(name);
  }
  // order в photo-map.json — порядок снимков (номера по умолчанию, с 1): сначала товар, в конце упаковка.
  if (m.order) {
    if (m.order.length !== unique.length || new Set(m.order).size !== unique.length) throw new Error(`${m.slug}: order должен перечислить все ${unique.length} фото`);
    unique = m.order.map(i => unique[i - 1]);
  }
  // original в photo-map.json — номера фото (в итоговом порядке), для которых берётся исходник без вырезки фона:
  // на крупных планах белого корпуса нейросеть путает пластик с фоном.
  const keepOriginal = new Set(originalsRoot ? m.original || [] : []);
  let n = 0;
  for (const name of unique) {
    n++;
    const fromDir = keepOriginal.has(n) ? path.join(originalsRoot, ...m.dir.split('/')) : dir;
    const buf = fs.readFileSync(path.join(fromDir, name));
    // Фото ставятся как есть (без осветления фона): автоматическое осветление портило белые корпуса.
    await sharp(buf).rotate().flatten({ background: '#ffffff' })
      .resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 }).toFile(path.join(out, `${String(n).padStart(2, '0')}.webp`));
  }
  console.log(`${m.slug}: ${n} фото`);
}
