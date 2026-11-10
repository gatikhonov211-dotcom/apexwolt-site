// Хранилище JSON-документов «ключ → объект» для API.
// В облаке — приватный бакет Object Storage (S3_BUCKET), доступ по IAM-токену сервисного аккаунта
// из метаданных функции (заголовок X-YaCloud-SubjectToken, без статических ключей).
// Локально — файлы в backend/data/kv (или REG_DATA_DIR/kv), каталог в .gitignore: там персональные данные.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'https://storage.yandexcloud.net';
const METADATA_TOKEN = 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token';
const useS3 = () => Boolean(process.env.S3_BUCKET);
const localDir = () => path.join(process.env.REG_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data'), 'kv');
const safeKey = key => {
  if (!/^[\w./-]+$/.test(key) || key.includes('..')) throw new Error(`Недопустимый ключ: ${key}`);
  return key;
};

let cachedToken;
async function iamToken() {
  if (process.env.YC_IAM_TOKEN) return process.env.YC_IAM_TOKEN;
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const r = await fetch(METADATA_TOKEN, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`IAM-токен недоступен: ${r.status}`);
  const j = await r.json();
  cachedToken = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return cachedToken.value;
}

async function s3(method, key, { body, query = '' } = {}) {
  const url = `${HOST}/${process.env.S3_BUCKET}/${key ? safeKey(key) : ''}${query}`;
  const headers = { 'X-YaCloud-SubjectToken': await iamToken() };
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  return fetch(url, { method, headers, body, signal: AbortSignal.timeout(10_000) });
}

export async function getJson(key) {
  if (!useS3()) {
    try { return JSON.parse(fs.readFileSync(path.join(localDir(), safeKey(key)), 'utf8')); } catch { return null; }
  }
  const r = await s3('GET', key);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Object Storage: чтение ${key} — ${r.status}`);
  return r.json();
}

export async function putJson(key, value) {
  const body = JSON.stringify(value, null, 2);
  if (!useS3()) {
    const file = path.join(localDir(), safeKey(key));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body, 'utf8');
    return value;
  }
  const r = await s3('PUT', key, { body });
  if (!r.ok) throw new Error(`Object Storage: запись ${key} — ${r.status}`);
  return value;
}

export async function remove(key) {
  if (!useS3()) { fs.rmSync(path.join(localDir(), safeKey(key)), { force: true }); return; }
  const r = await s3('DELETE', key);
  if (!r.ok && r.status !== 404) throw new Error(`Object Storage: удаление ${key} — ${r.status}`);
}

// Ключи с префиксом (для списка заявок). S3 ListObjectsV2 отдаёт XML по 1000 ключей.
export async function listKeys(prefix) {
  safeKey(prefix);
  if (!useS3()) {
    const dir = path.join(localDir(), prefix);
    try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => `${prefix}${f}`); } catch { return []; }
  }
  const keys = [];
  let token = '';
  do {
    const query = `?list-type=2&prefix=${encodeURIComponent(prefix)}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    const r = await s3('GET', '', { query });
    if (!r.ok) throw new Error(`Object Storage: список ${prefix} — ${r.status}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (xml.match(/<NextContinuationToken>([^<]+)</) || [])[1] : '';
  } while (token);
  return keys.filter(k => k.endsWith('.json'));
}
