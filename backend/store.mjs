// Данные B2B поверх хранилища kv.mjs (Object Storage в облаке, файлы backend/data/kv локально):
//   registrations/<ИНН>.json  — заявка организации: реквизиты, контакт, статус, коэффициент
//   users/<ключ email>.json   — доступ партнёра: email → ИНН организации (создаётся при одобрении)
//   costs.json                — закупочная стоимость по артикулам (загружает менеджер из Excel)
//   codes/<ключ email>.json   — одноразовые коды входа (auth.mjs)
// Закупочная стоимость и коэффициенты никогда не попадают в публичные данные сайта.
import { getJson, putJson, remove, listKeys } from './kv.mjs';

const regKey = inn => `registrations/${inn}.json`;
const userKey = emailKey => `users/${emailKey}.json`;

export async function getRegistration(inn) {
  return getJson(regKey(inn));
}

export async function findRegistrationByInn(inn) {
  const r = await getRegistration(inn);
  return r && r.status !== 'rejected' ? r : null;
}

export async function saveRegistration(record) {
  return putJson(regKey(record.company.inn), record);
}

export async function listRegistrations() {
  const keys = await listKeys('registrations/');
  const list = await Promise.all(keys.map(k => getJson(k)));
  return list.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getUser(emailKey) {
  return getJson(userKey(emailKey));
}

export async function saveUser(emailKey, user) {
  return putJson(userKey(emailKey), user);
}

export async function removeUser(emailKey) {
  return remove(userKey(emailKey));
}

export async function getCosts() {
  return (await getJson('costs.json')) || { costs: {}, count: 0, updatedAt: null, source: null };
}

export async function saveCosts(doc) {
  return putJson('costs.json', doc);
}
