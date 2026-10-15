// Проверка ИНН по контрольным цифрам (10 цифр — организация, 12 — ИП/физлицо).
const W10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const W12a = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const W12b = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

const check = (digits, weights) => weights.reduce((s, w, i) => s + w * digits[i], 0) % 11 % 10;

export function isValidInn(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{10}(\d{2})?$/.test(s)) return false;
  const d = [...s].map(Number);
  if (d.length === 10) return check(d, W10) === d[9];
  return check(d, W12a) === d[10] && check(d, W12b) === d[11];
}
