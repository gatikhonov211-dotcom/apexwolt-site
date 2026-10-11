// Собирает assets/js/data.js из каталога основного проекта APEXWOLT B2B.
// Запуск: node tools/build-data.mjs [путь к catalog.data.js]
// По умолчанию берёт ../apexwolt-b2b/dist/catalog.data.js рядом с этим проектом.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || path.join(root, '..', 'apexwolt-b2b', 'dist', 'catalog.data.js'));
const CATEGORY = 'svarochnye-apparaty';

const context = {};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync(source, 'utf8')};this.categoryData=categoryData;`, context);
const category = context.categoryData[CATEGORY];
if (!category) throw new Error(`Категория ${CATEGORY} не найдена в ${source}`);

const num = s => parseFloat(String(s).replace(',', '.'));
const spec = (specs, re) => {
  const line = specs.find(s => re.test(s));
  return line ? line.slice(line.indexOf(':') + 1).trim() : '';
};
const range = text => {
  const m = text.match(/([\d,]+)\s*[–-]\s*([\d,]+)/);
  return m ? [num(m[1]), num(m[2])] : null;
};
const yes = text => /^(да|есть)/i.test(text);

const products = category.variants.map(v => {
  const [id, sku, name, stock, lead, price, specs, brand, , mp, description, image, eta] = v;
  const type = spec(specs, /^Тип сварки/);
  const processes = [
    /MMA/.test(type) && 'MMA',
    /MIG/.test(type) && 'MIG/MAG',
    /FLUX/.test(type) && 'FLUX',
    /TIG/.test(type) && 'TIG'
  ].filter(Boolean);
  const kind = /MIG/.test(type) ? 'mig' : 'mma';
  const current = range(spec(specs, /^(Диапазон регулирования сварочного тока|Сварочный ток MIG)/)) || [0, 0];
  const mains = range(spec(specs, /^(Параметры сети|Диапазон рабочего напряжения)/)) || [0, 0];
  const duty = spec(specs, /^Продолжительность нагружения/);
  const wire = spec(specs, /^Диаметр сварочной проволоки/);
  const mmaFunctions = spec(specs, /^(Hot Start|Arc Force \/ Hot Start)/);
  return {
    id, sku, name, brand: brand || 'APEXWOLT', kind, processes,
    stock: Boolean(stock), lead, price, mp: mp ?? null, eta: eta || '',
    current, mains,
    duty: duty.replace(/\s+при.*/, ''),
    electrode: num(spec(specs, /диаметр электрода/i)) || null,
    wire: wire ? wire.split('/').map(s => num(s)) : [],
    weight: num(spec(specs, /^Масса/)) || null,
    hotStart: yes(mmaFunctions),
    synergic: yes(spec(specs, /^Синергетическое/)),
    twoFourT: yes(spec(specs, /2T\/4T/)),
    image: `assets/img/products/${path.basename(image)}`,
    description, specs
  };
});

const out = `/* Сгенерировано tools/build-data.mjs из каталога APEXWOLT B2B — не редактировать вручную. */
window.APEX_DATA = ${JSON.stringify({
  section: {
    key: 'svarochnoe-oborudovanie',
    title: 'Сварочное оборудование',
    lead: 'Инверторы MMA и полуавтоматы MIG/MAG APEXWOLT для мастерских, производства и выездных работ. МРЦ и наличие — открыто, партнёрские условия — после входа.'
  },
  subcategories: [
    { key: 'mma', title: 'Инверторы MMA' },
    { key: 'mig', title: 'Полуавтоматы MIG/MAG' }
  ],
  products
}, null, 2)};
`;
fs.writeFileSync(path.join(root, 'assets', 'js', 'data.js'), out);
console.log(`data.js: ${products.length} товаров из ${source}`);
