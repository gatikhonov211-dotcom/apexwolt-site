// Вырезает фон у фото товаров нейросетью (локально, @imgly/background-removal-node) и кладёт товар на белый фон.
// Результат повторяет структуру папок исходной выгрузки — дальше его обрабатывает process-photos.mjs.
// Запуск: node tools/cutout-photos.mjs <папка выгрузки> <папка результата> [source]
//   source — какие модели из photo-map.json брать (по умолчанию apex). Готовые файлы не пересчитываются.
// Важно: sharp здесь — та же версия, что у нейросети (0.32), иначе две копии libvips конфликтуют в одном процессе.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { removeBackground } from '@imgly/background-removal-node';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const sharp = require(path.join(root, 'node_modules', '@imgly', 'background-removal-node', 'node_modules', 'sharp'));
const [srcArg, outArg, only = 'apex'] = process.argv.slice(2);
if (!srcArg || !outArg) throw new Error('Укажите папку выгрузки и папку результата');
const src = path.resolve(srcArg), outRoot = path.resolve(outArg);
const { models } = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'photo-map.json'), 'utf8'));

let done = 0, skipped = 0;
for (const m of models.filter(x => x.source === only)) {
  const dir = path.join(src, ...m.dir.split('/'));
  if (!fs.existsSync(dir)) { console.warn(`нет папки: ${m.dir}`); continue; }
  const outDir = path.join(outRoot, ...m.dir.split('/'));
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of fs.readdirSync(dir).filter(n => /\.(jpe?g|png|webp)$/i.test(n))) {
    // Имя файла как в исходнике (содержимое — PNG): от имени зависит порядок фото в галерее.
    const out = path.join(outDir, name);
    if (fs.existsSync(out)) { skipped++; continue; }
    const input = await sharp(path.join(dir, name)).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const blob = await removeBackground(new Blob([input], { type: 'image/png' }), { model: 'medium', output: { format: 'image/png' } });
    await sharp(Buffer.from(await blob.arrayBuffer())).flatten({ background: '#ffffff' }).png().toFile(out);
    done++;
  }
  console.log(`${m.slug}: готово`);
}
console.log(`вырезано: ${done}, уже было: ${skipped}`);
