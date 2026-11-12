// Готовит фото товаров для сайта: WebP до 1200 px, качество 88, без изменения цветов и фона.
// Запуск: npm install && node tools/process-photos.mjs <папка выгрузки> [source] [папка исходников]
// source — какие модели из photo-map.json обрабатывать (apex | heat | sumo | weld или slug через запятую); без него — все.
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
// Третий аргумент — source (apex | heat | sumo | weld) или список slug через запятую.
for (const m of models.filter(x => !only || x.source === only || only.split(',').includes(x.slug))) {
  // dirs — несколько папок одной модели подряд (например, фото на белом фоне + снимки в работе); dir — одна папка.
  const rels = m.dirs || [m.dir];
  const missing = rels.filter(r => !fs.existsSync(path.join(src, ...r.split('/'))));
  if (missing.length) { console.warn(`нет папки: ${missing.join(', ')}`); continue; }
  const dir = rels.length > 1 ? src : path.join(src, ...m.dir.split('/'));
  const out = path.join(outRoot, m.slug);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const seen = new Set();
  // sort: "numeric" — по имени с учётом чисел (1, 2, … 10); иначе прежний порядок order().
  const sorter = m.sort === 'numeric' ? (a, b) => a.localeCompare(b, 'ru', { numeric: true }) : order;
  const names = rels.flatMap(r => fs.readdirSync(path.join(src, ...r.split('/')))
    .filter(n => /\.(jpe?g|png|webp)$/i.test(n)).sort(sorter).map(n => rels.length > 1 ? `${r}/${n}` : n));
  // lead в photo-map.json — какой снимок поставить главным (например, сам прибор вместо коробки).
  if (m.lead && names.includes(m.lead)) names.unshift(...names.splice(names.indexOf(m.lead), 1));
  let unique = [];
  for (const name of names) {
    const buf = fs.readFileSync(path.join(dir, ...name.split('/')));
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
  // pick — выбрать и упорядочить часть снимков (номера с 1); остальные не используются (дубли, неудачные кадры).
  if (m.pick) {
    if (m.pick.some(i => !unique[i - 1]) || new Set(m.pick).size !== m.pick.length) throw new Error(`${m.slug}: pick — номера от 1 до ${unique.length} без повторов`);
    unique = m.pick.map(i => unique[i - 1]);
  }
  // original в photo-map.json — номера фото (в итоговом порядке), для которых берётся исходник без вырезки фона:
  // на крупных планах белого корпуса нейросеть путает пластик с фоном.
  const keepOriginal = new Set(originalsRoot ? m.original || [] : []);
  let n = 0;
  for (const name of unique) {
    n++;
    const fromDir = keepOriginal.has(n) ? path.join(originalsRoot, ...m.dir.split('/')) : dir;
    const buf = fs.readFileSync(path.join(fromDir, ...name.split('/')));
    // Фото ставятся как есть (без осветления фона): автоматическое осветление портило белые корпуса.
    await sharp(buf).rotate().flatten({ background: '#ffffff' })
      .resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 }).toFile(path.join(out, `${String(n).padStart(2, '0')}.webp`));
  }
  console.log(`${m.slug}: ${n} фото`);
}
