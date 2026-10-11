// Собирает assets/js/data.js и копирует фото товаров из основного проекта APEXWOLT B2B.
// Запуск: node tools/build-data.mjs [путь к папке dist основного проекта]
// По умолчанию — ../apexwolt-b2b/dist рядом с этим проектом.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

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
const copied = new Map();
const image = src => {
  if (isPlaceholder(src)) return '';
  if (copied.has(src)) return copied.get(src);
  const from = path.join(dist, src);
  if (!fs.existsSync(from)) { console.warn(`нет файла: ${src}`); copied.set(src, ''); return ''; }
  const name = path.basename(src);
  fs.copyFileSync(from, path.join(imgOut, name));
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

const data = { sections, categories, products, novelties: novelties.filter(inNoveltySection) };
fs.writeFileSync(path.join(root, 'assets', 'js', 'data.js'),
  `/* Сгенерировано tools/build-data.mjs из каталога APEXWOLT B2B — не редактировать вручную. */\nwindow.APEX_DATA = ${JSON.stringify(data)};\n`);
console.log(`галереи: ${withGallery} товаров`);
console.log(`data.js: ${sections.length} направлений, ${Object.keys(categories).length} категорий, ${products.length} товаров, ${data.novelties.length} новинок, ${[...copied.values()].filter(Boolean).length} фото`);
