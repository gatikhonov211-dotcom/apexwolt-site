// Обновление серверной части (Cloud Function apex-api) из git-ревизии.
//   YC_BIN=<путь к yc> node tools/deploy-function.mjs [git-ref=HEAD] [SITE_URL=https://b2b.apexwoltshop.ru]
// Берёт backend/*.mjs, index.js и package*.json из ревизии, создаёт новую версию функции.
// Переменные окружения, секреты Lockbox, сервисный аккаунт, память и таймаут копируются из текущей версии —
// значения секретов скрипт не видит и не печатает.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ref = process.argv[2] || 'HEAD';
const siteUrl = process.argv[3] || 'https://b2b.apexwoltshop.ru';
const YC = process.env.YC_BIN || 'yc';
const FILES = ['index.js', 'api.mjs', 'auth.mjs', 'dadata.mjs', 'inn.mjs', 'kv.mjs', 'mailer.mjs', 'store.mjs', 'package.json', 'package-lock.json'];

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-fn-'));
for (const f of FILES) fs.writeFileSync(path.join(stage, f), execFileSync('git', ['-C', root, 'show', `${ref}:backend/${f}`]));

const yc = args => spawnSync(YC, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
const cur = JSON.parse(yc(['serverless', 'function', 'version', 'get-by-tag', '--function-name', 'apex-api', '--tag', '$latest', '--format', 'json']).stdout);
const env = { ...cur.environment, SITE_URL: siteUrl };
const args = ['serverless', 'function', 'version', 'create', '--function-name', 'apex-api', '--runtime', cur.runtime, '--entrypoint', cur.entrypoint,
  '--memory', `${Math.round(Number(cur.resources.memory) / 1048576)}m`, '--execution-timeout', cur.execution_timeout,
  '--service-account-id', cur.service_account_id, '--source-path', stage, '--format', 'json'];
// Значения с запятыми (ALLOWED_ORIGINS, MANAGER_EMAILS) — в кавычках, как CSV.
for (const [k, v] of Object.entries(env)) args.push('--environment', `"${`${k}=${v}`.replace(/"/g, '""')}"`);
for (const s of cur.secrets || []) args.push('--secret', `environment-variable=${s.environment_variable},id=${s.id},version-id=${s.version_id},key=${s.key}`);
const r = yc(args);
fs.rmSync(stage, { recursive: true, force: true });
if (r.status) { console.error(r.stderr.split('\n').slice(-5).join('\n')); process.exit(1); }
const v = JSON.parse(r.stdout);
console.log(`apex-api: версия ${v.id} (${v.status}) из ${ref}`);
