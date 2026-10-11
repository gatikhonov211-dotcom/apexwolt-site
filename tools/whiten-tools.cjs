// Перекрашивает бирюзово-синий корпус инструмента на фото производства в белый (фирменный цвет APEXWOLT).
// Форма рабочих (тёмно-синяя, ~215–225°) и синие стойки станков (~206°) по оттенку не попадают в маску.
// Запуск: node tools/whiten-tools.cjs <вход> <выход>
// Только для кадров с инструментом (factory-line, factory-quality): на общем плане маска цепляет голубое стекло фасада.
const sharp = require('sharp');
const [src, out] = process.argv.slice(2);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Мягкая маска: оттенок 187–206°, насыщенность от ~0,4, светлота 0,07–0,85 (коврик стола — 179–193° и бледнее).
const weightAt = (R, G, B) => {
  const r = R / 255, g = G / 255, b = B / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return 0;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return smooth(184, 190, h) * (1 - smooth(204, 209, h)) * smooth(0.34, 0.48, s) * smooth(0.05, 0.1, l) * (1 - smooth(0.82, 0.9, l));
};
(async () => {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let changed = 0;
  const { width, height } = info;
  // 1) карта весов маски, 2) усреднение по соседям — одиночные пиксели (шум сжатия на столе) отбрасываются.
  const wmap = new Float32Array(width * height);
  for (let p = 0, i = 0; p < wmap.length; p++, i += 3) wmap[p] = weightAt(data[i], data[i + 1], data[i + 2]);
  const R = 3, area = (2 * R + 1) ** 2;
  const dens = new Float32Array(wmap.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let dy = -R; dy <= R; dy++) { const yy = Math.min(height - 1, Math.max(0, y + dy)); for (let dx = -R; dx <= R; dx++) sum += wmap[yy * width + Math.min(width - 1, Math.max(0, x + dx))]; }
    dens[y * width + x] = sum / area;
  }
  for (let i = 0; i < data.length; i += 3) {
    const p = i / 3;
    const w = Math.max(wmap[p], dens[p] * 0.6) * smooth(0.18, 0.4, dens[p]);
    if (w < 0.02) continue;
    const l = (Math.max(data[i], data[i + 1], data[i + 2]) + Math.min(data[i], data[i + 1], data[i + 2])) / 510;
    // Белый пластик с объёмом: светлота корпуса растягивается в диапазон 0,58–0,97, лёгкий холодный оттенок.
    const lw = 0.58 + 0.39 * Math.min(1, Math.pow(l / 0.6, 0.8));
    const tr = lw * 255 * 0.985, tg = lw * 255 * 0.99, tb = lw * 255;
    data[i] = data[i] + (tr - data[i]) * w;
    data[i + 1] = data[i + 1] + (tg - data[i + 1]) * w;
    data[i + 2] = data[i + 2] + (tb - data[i + 2]) * w;
    changed++;
  }
  await sharp(data, { raw: info }).webp({ quality: 86 }).toFile(out);
  console.log(`${out}: изменено ${changed} px`);
})();
