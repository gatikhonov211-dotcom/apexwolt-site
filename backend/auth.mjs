// Вход по одноразовому коду из письма и подписанный токен сессии.
//   AUTH_SECRET — секрет подписи (Lockbox / backend/.env), без него вход отключён.
//   Код: 6 цифр, живёт 10 минут, 5 попыток, повторная отправка — не чаще раза в минуту.
//   В хранилище лежит только HMAC кода и HMAC email (ключ файла), не сами значения.
//   Токен: base64url(JSON).base64url(HMAC-SHA256), срок 30 дней; права перепроверяются при каждом запросе.
import crypto from 'node:crypto';
import { getJson, putJson, remove } from './kv.mjs';

const CODE_TTL = 10 * 60_000;
const RESEND_AFTER = 60_000;
const MAX_ATTEMPTS = 5;
const TOKEN_TTL = 30 * 24 * 3600_000;

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw Object.assign(new Error('Вход временно недоступен'), { code: 'config' });
  return s;
};
const hmac = value => crypto.createHmac('sha256', secret()).update(value).digest();
const b64url = buf => Buffer.from(buf).toString('base64url');

export const normalizeEmail = email => String(email ?? '').trim().toLowerCase();
export const emailKey = email => hmac(`email:${normalizeEmail(email)}`).subarray(0, 16).toString('hex');
const codeKey = email => `codes/${emailKey(email)}.json`;
const codeHash = (email, code) => b64url(hmac(`code:${normalizeEmail(email)}:${code}`));

export const managerEmails = () => (process.env.MANAGER_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean);
export const isManager = email => managerEmails().includes(normalizeEmail(email));

// Создать код. Возвращает { code } или { wait: секунд } при слишком частых запросах.
export async function issueCode(email, now = Date.now()) {
  const prev = await getJson(codeKey(email));
  if (prev && now - prev.sentAt < RESEND_AFTER) return { wait: Math.ceil((RESEND_AFTER - (now - prev.sentAt)) / 1000) };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await putJson(codeKey(email), { hash: codeHash(email, code), sentAt: now, expires: now + CODE_TTL, attempts: 0 });
  return { code };
}

// Проверить код. true — верный (код сразу гасится), иначе строка с причиной.
export async function checkCode(email, code, now = Date.now()) {
  const rec = await getJson(codeKey(email));
  if (!rec || now > rec.expires) return 'Код устарел — запросите новый';
  if (rec.attempts >= MAX_ATTEMPTS) return 'Слишком много попыток — запросите новый код';
  const ok = crypto.timingSafeEqual(Buffer.from(rec.hash), Buffer.from(codeHash(email, String(code).trim())));
  if (!ok) {
    await putJson(codeKey(email), { ...rec, attempts: rec.attempts + 1 });
    return rec.attempts + 1 >= MAX_ATTEMPTS ? 'Слишком много попыток — запросите новый код' : 'Неверный код';
  }
  await remove(codeKey(email));
  return true;
}

export function signToken(payload, now = Date.now()) {
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + TOKEN_TTL }));
  return `${body}.${b64url(hmac(`token:${body}`))}`;
}

export function verifyToken(token, now = Date.now()) {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  const expected = b64url(hmac(`token:${body}`));
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > now ? payload : null;
  } catch { return null; }
}

// ---------- Пароль (по желанию пользователя, вместо кода при каждом входе) ----------
//   passwords/<ключ email>.json — соль и хеш scrypt, счётчик неудачных попыток и блокировка.
//   10 неверных паролей подряд — пауза 15 минут (вход по коду при этом работает).
const PW_MIN = 8;
const PW_MAX = 128;
const PW_MAX_FAILS = 10;
const PW_LOCK = 15 * 60_000;
const pwKey = email => `passwords/${emailKey(email)}.json`;
const scrypt = (password, salt) => new Promise((resolve, reject) =>
  crypto.scrypt(String(password).normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => err ? reject(err) : resolve(key)));

export const passwordProblem = password => {
  const p = String(password ?? '');
  if (p.length < PW_MIN) return `Пароль — не короче ${PW_MIN} символов`;
  if (p.length > PW_MAX) return `Пароль — не длиннее ${PW_MAX} символов`;
  if (/^\d+$/.test(p) || /^(.)\1+$/.test(p)) return 'Слишком простой пароль — добавьте буквы';
  return null;
};

export const hasPassword = async email => Boolean(await getJson(pwKey(email)));
export const removePassword = email => remove(pwKey(email));

export async function setPassword(email, password, now = Date.now()) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt);
  await putJson(pwKey(email), { salt: b64url(salt), hash: b64url(hash), setAt: new Date(now).toISOString(), fails: 0, lockedUntil: 0 });
}

// Проверить пароль. true — верный, иначе строка с причиной (одинаковая для «нет такого» и «неверный»).
export async function checkPassword(email, password, now = Date.now()) {
  const WRONG = 'Неверный email или пароль';
  const rec = await getJson(pwKey(email));
  if (!rec) { await scrypt(password, crypto.randomBytes(16)); return WRONG; } // одинаковое время ответа
  if (rec.lockedUntil > now) return `Слишком много попыток — подождите ${Math.ceil((rec.lockedUntil - now) / 60_000)} мин или войдите по коду из письма`;
  const hash = await scrypt(password, Buffer.from(rec.salt, 'base64url'));
  if (crypto.timingSafeEqual(hash, Buffer.from(rec.hash, 'base64url'))) {
    if (rec.fails) await putJson(pwKey(email), { ...rec, fails: 0, lockedUntil: 0 });
    return true;
  }
  const fails = rec.fails + 1;
  const locked = fails >= PW_MAX_FAILS;
  await putJson(pwKey(email), { ...rec, fails: locked ? 0 : fails, lockedUntil: locked ? now + PW_LOCK : 0 });
  return locked ? `Слишком много попыток — подождите ${PW_LOCK / 60_000} мин или войдите по коду из письма` : WRONG;
}
