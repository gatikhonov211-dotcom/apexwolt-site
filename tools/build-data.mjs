// Собирает assets/js/data.js и копирует фото товаров из основного проекта APEXWOLT B2B.
// Запуск: node tools/build-data.mjs [путь к папке dist основного проекта]
// По умолчанию — ../apexwolt-b2b/dist рядом с этим проектом.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(process.argv[2] || path.join(root, '..', 'apexwolt-b2b', 'dist'));
const imgOut = path.join(root, 'assets', 'img', 'catalog');

// Новинки — тот же список, что на главной основного сайта (dist/catalog-shop.js, NOVELTY_IDS).
const shopJs = fs.readFileSync(path.join(dist, 'catalog-shop.js'), 'utf8');
const noveltyBlock = shopJs.match(/NOVELTY_IDS\s*=\s*\[([\s\S]*?)\]/);
const novelties = noveltyBlock ? [...noveltyBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];

const context = {};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync(path.join(dist, 'catalog.data.js'), 'utf8')};this.categoryData=categoryData;this.sectionData=sectionData;`, context);
const { categoryData, sectionData } = context;

// Логотип как «картинка категории» в исходнике означает «фото нет» — показываем фирменную заглушку.
const isPlaceholder = src => !src || /apexwolt-logo/.test(src);
fs.mkdirSync(imgOut, { recursive: true });
// Фото каталога переводятся в WebP до 900 px (прозрачность сохраняется): исходные PNG весят 0,6–1,8 МБ
// и тормозили страницы каталога. Конвертация — одним проходом в конце скрипта.
const copied = new Map();
const convertJobs = [];
const image = src => {
  if (isPlaceholder(src)) return '';
  if (copied.has(src)) return copied.get(src);
  const from = path.join(dist, src);
  if (!fs.existsSync(from)) { console.warn(`нет файла: ${src}`); copied.set(src, ''); return ''; }
  const name = `${path.basename(src, path.extname(src))}.webp`;
  convertJobs.push({ from, to: path.join(imgOut, name) });
  const out = `assets/img/catalog/${name}`;
  copied.set(src, out);
  return out;
};

const sectionOf = {};
const sections = Object.entries(sectionData).map(([key, s]) => {
  s.categories.forEach(c => { sectionOf[c] = key; });
  return { key, title: s.title, description: s.description || '', categories: s.categories.filter(c => categoryData[c]) };
});

const categories = {};
const products = [];
for (const [key, c] of Object.entries(categoryData)) {
  if (!sectionOf[key]) { console.warn(`категория без направления пропущена: ${key}`); continue; }
  categories[key] = { title: c.title, section: sectionOf[key], image: image(c.image) };
  for (const v of c.variants) {
    const [id, sku, name, stock, lead, price, specs, brand, , , description, img, eta] = v;
    products.push({
      id, sku, name, brand: brand || '', category: key,
      stock: Number(stock) || 0, lead: Number(lead) || 0, price: Number(price) || 0,
      eta: eta || '', description: description || '', specs: specs || [],
      // Только собственное фото товара: картинка категории показывает другую модель/комплектацию.
      image: image(img)
    });
  }
}

// Галереи фото по моделям (tools/photo-map.json + tools/process-photos.mjs). Первое фото — главное.
const photoMap = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'photo-map.json'), 'utf8'));
let withGallery = 0;
for (const m of photoMap.models) {
  const dir = path.join(root, 'assets', 'img', 'products', m.slug);
  if (!fs.existsSync(dir)) { console.warn(`нет обработанных фото: ${m.slug}`); continue; }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.webp')).sort().map(f => `assets/img/products/${m.slug}/${f}`);
  for (const id of m.ids) {
    const p = products.find(x => x.id === id);
    if (!p) { console.warn(`нет товара ${id} для фото ${m.slug}`); continue; }
    p.images = files;
    p.image = files[0];
    withGallery++;
  }
}
for (const p of products) if (!p.images) p.images = p.image ? [p.image] : [];

// Короткое название для карточек: всё до первой «, » (модель вида «ДА-16,8-45» не режется — там нет пробела).
// Комплектация из хвоста («2 АКБ 2,0 Ач + ЗУ», «кейс», «без АКБ и ЗУ») — отдельной строкой, чтобы не путать варианты.
// Двуязычные названия «… / …» и названия, которые после сокращения совпали бы с другими, остаются полными.
const shortOf = name => {
  const i = name.indexOf(', ');
  return i > 0 && !name.includes(' / ') ? name.slice(0, i) : name;
};
const shortCount = {};
products.forEach(p => { const s = shortOf(p.name); shortCount[s] = (shortCount[s] || 0) + 1; });
for (const p of products) {
  const s = shortOf(p.name);
  p.title = shortCount[s] > 1 ? p.name : s;
  p.kit = p.title === p.name ? '' : p.name.slice(s.length + 2).split(', ').filter(part => /АКБ|ЗУ|кейс/i.test(part)).join(', ');
}

// Разбивка категорий на подразделы — только для этого сайта, исходный каталог не меняется.
const SPLITS = {
  'svarochnye-apparaty': [
    { key: 'svarochnye-invertory', title: 'Сварочные инверторы', match: p => /\bMMA\b/.test(p.name) },
    { key: 'svarochnye-poluavtomaty', title: 'Сварочные полуавтоматы', match: p => /\bMIG\b/.test(p.name) }
  ]
};
for (const [key, parts] of Object.entries(SPLITS)) {
  const base = categories[key];
  if (!base) continue;
  const items = products.filter(p => p.category === key);
  for (const part of parts) {
    categories[part.key] = { title: part.title, section: base.section, image: base.image };
    items.filter(part.match).forEach(p => { p.category = part.key; });
  }
  const left = items.filter(p => p.category === key);
  if (left.length) throw new Error(`${key}: не разнесены по подразделам — ${left.map(p => p.name).join(', ')}`);
  delete categories[key];
  const section = sections.find(s => s.key === base.section);
  section.categories.splice(section.categories.indexOf(key), 1, ...parts.map(p => p.key));
}

// Новинки на сайте — только сварочное оборудование, в порядке списка NOVELTY_IDS.
const NOVELTY_SECTION = 'svarochnoe-oborudovanie';
const inNoveltySection = id => { const p = products.find(x => x.id === id); return p && categories[p.category].section === NOVELTY_SECTION; };

// Метка версии в адресе фото (?v=хеш файла): после замены фото браузер сразу берёт новое,
// а не показывает сохранённое в кеше (GitHub Pages кеширует файлы до 10 минут).
const versioned = new Map();
const withVersion = src => {
  if (!src) return src;
  if (!versioned.has(src)) {
    const file = path.join(root, src);
    versioned.set(src, fs.existsSync(file) ? `${src}?v=${crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8)}` : src);
  }
  return versioned.get(src);
};
for (const p of products) { p.image = withVersion(p.image); p.images = p.images.map(withVersion); }
for (const c of Object.values(categories)) c.image = withVersion(c.image);

const data = { sections, categories, products, novelties: novelties.filter(inNoveltySection) };
// Старые файлы каталога (PNG и т. п.) удаляем, оставляем только актуальные WebP.
const keep = new Set(convertJobs.map(j => path.basename(j.to)));
for (const f of fs.readdirSync(imgOut)) if (!keep.has(f)) fs.rmSync(path.join(imgOut, f));
for (const job of convertJobs) {
  if (fs.existsSync(job.to) && fs.statSync(job.to).mtimeMs >= fs.statSync(job.from).mtimeMs) continue;
  await sharp(job.from).resize(900, 900, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 }).toFile(job.to);
}

fs.writeFileSync(path.join(root, 'assets', 'js', 'data.js'),
  `/* Сгенерировано tools/build-data.mjs из каталога APEXWOLT B2B — не редактировать вручную. */\nwindow.APEX_DATA = ${JSON.stringify(data)};\n`);
const dataHash = crypto.createHash('sha1').update(fs.readFileSync(path.join(root, 'assets', 'js', 'data.js'))).digest('hex').slice(0, 8);
for (const page of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  const file = path.join(root, page);
  const html = fs.readFileSync(file, 'utf8').replace(/assets\/js\/data\.js(\?v=[0-9a-f]+)?"/g,`assets/js/data.js?v=${dataHash}"`);
  fs.writeFileSync(file, html);
}
console.log(`галереи: ${withGallery} товаров`);
console.log(`data.js: ${sections.length} направлений, ${Object.keys(categories).length} категорий, ${products.length} товаров, ${data.novelties.length} новинок, ${[...copied.values()].filter(Boolean).length} фото`);
