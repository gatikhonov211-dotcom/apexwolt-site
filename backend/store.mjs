// Хранение заявок на регистрацию партнёра. Сейчас — локальный JSON (backend/data, в .gitignore:
// там персональные данные). В Yandex Cloud — YDB (store-ydb.mjs), если заданы YDB_ENDPOINT и YDB_DATABASE.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = () => process.env.REG_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const file = () => path.join(dataDir(), 'registrations.json');

const useYdb = () => Boolean(process.env.YDB_ENDPOINT && process.env.YDB_DATABASE);
const ydbStore = () => import('./store-ydb.mjs');

const readAll = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return []; } };

export async function findRegistrationByInn(inn) {
  if (useYdb()) return (await ydbStore()).findRegistrationByInn(inn);
  return readAll().find(r => r.company.inn === inn && r.status !== 'rejected') || null;
}

export async function saveRegistration(record) {
  if (useYdb()) return (await ydbStore()).saveRegistration(record);
  fs.mkdirSync(dataDir(), { recursive: true });
  const list = readAll();
  list.push(record);
  fs.writeFileSync(file(), JSON.stringify(list, null, 2), 'utf8');
  return record;
}
