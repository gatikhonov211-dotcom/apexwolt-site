// Публикация статики сайта в бакет Yandex Object Storage (хостинг b2b.apexwoltshop.ru с HTTPS).
//   node tools/deploy-static.mjs [git-ref=origin/main] [bucket=b2b.apexwoltshop.ru] [--dry]
// Берёт файлы из git-ревизии (то, что опубликовано на GitHub), без backend/, tools/ и служебных файлов.
// Синхронизация: загружает новые и изменённые файлы (сравнение MD5 с ETag), удаляет лишние.
// Доступ — IAM-токен текущего пользователя yc (yc iam create-token), ключи не нужны.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const dry = process.argv.includes('--dry');
const ref = args[0] || 'origin/main';
const bucket = args[1] || 'b2b.apexwoltshop.ru';
const YC = process.env.YC_BIN || 'yc';
const HOST = 'https://storage.yandexcloud.net';

const SKIP = [/^backend\//, /^tools\//, /^node_modules\//, /^\./, /\.md$/, /^package(-lock)?\.json$/, /^serve\.json$/, /^CNAME$/];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml'
};
// HTML и данные — короткий кеш (адреса скриптов и картинок версионируются ?v=хеш), остальное — сутки.
const cacheOf = key => /\.(html|json)$/.test(key) ? 'max-age=300' : /\.(js|css)$/.test(key) ? 'max-age=600' : 'max-age=86400';

const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 30 });
const files = git('ls-tree', '-r', '--name-only', ref).toString().split('\n').filter(f => f && !SKIP.some(r => r.test(f)));
const token = execFileSync(YC, ['iam', 'create-token'], { encoding: 'utf8' }).trim();
const auth = { 'X-YaCloud-SubjectToken': token };

async function listRemote() {
  const map = new Map();
  let cont = '';
  do {
    const r = await fetch(`${HOST}/${bucket}?list-type=2${cont ? `&continuation-token=${encodeURIComponent(cont)}` : ''}`, { headers: auth });
    if (!r.ok) throw new Error(`список объектов: ${r.status}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Contents>[\s\S]*?<Key>([^<]+)<\/Key>[\s\S]*?<ETag>"?([^<"]+)"?<\/ETag>[\s\S]*?<\/Contents>/g)) map.set(m[1].replace(/&amp;/g, '&'), m[2].replace(/&quot;/g, ''));
    cont = /<IsTruncated>true/.test(xml) ? (xml.match(/<NextContinuationToken>([^<]+)</) || [])[1] : '';
  } while (cont);
  return map;
}

const url = key => `${HOST}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
const remote = await listRemote();
let uploaded = 0, same = 0, removed = 0;

for (const key of files) {
  const body = git('show', `${ref}:${key}`);
  const md5 = crypto.createHash('md5').update(body).digest('hex');
  if (remote.get(key) === md5) { same++; remote.delete(key); continue; }
  remote.delete(key);
  if (dry) { console.log('загрузить', key); uploaded++; continue; }
  const type = TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';
  const r = await fetch(url(key), { method: 'PUT', headers: { ...auth, 'Content-Type': type, 'Cache-Control': cacheOf(key), 'x-amz-acl': 'public-read' }, body });
  if (!r.ok) throw new Error(`${key}: ${r.status} ${await r.text()}`);
  uploaded++;
}
for (const key of remote.keys()) {
  if (dry) { console.log('удалить', key); removed++; continue; }
  const r = await fetch(url(key), { method: 'DELETE', headers: auth });
  if (!r.ok && r.status !== 404) throw new Error(`удаление ${key}: ${r.status}`);
  removed++;
}
console.log(`${dry ? '[проверка] ' : ''}${ref} → ${bucket}: загружено ${uploaded}, без изменений ${same}, удалено ${removed}`);
