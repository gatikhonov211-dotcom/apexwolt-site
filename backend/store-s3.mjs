// Хранение заявок в Yandex Object Storage (приватный бакет, данные в РФ). Включается переменной S3_BUCKET.
// Одна заявка — один файл registrations/<ИНН>.json. Доступ по IAM-токену сервисного аккаунта
// (метаданные функции) через заголовок X-YaCloud-SubjectToken — без статических ключей.
// Локально токен берётся из YC_IAM_TOKEN (yc iam create-token).
const HOST = 'https://storage.yandexcloud.net';
const METADATA_TOKEN = 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token';

let cached;
async function iamToken() {
  if (process.env.YC_IAM_TOKEN) return process.env.YC_IAM_TOKEN;
  if (cached && cached.expires > Date.now() + 60_000) return cached.value;
  const r = await fetch(METADATA_TOKEN, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`IAM-токен недоступен: ${r.status}`);
  const j = await r.json();
  cached = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return cached.value;
}

const objectUrl = inn => `${HOST}/${process.env.S3_BUCKET}/registrations/${encodeURIComponent(inn)}.json`;

export async function findRegistrationByInn(inn) {
  const r = await fetch(objectUrl(inn), { headers: { 'X-YaCloud-SubjectToken': await iamToken() }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Object Storage: чтение ${r.status}`);
  const record = await r.json();
  return record.status === 'rejected' ? null : record;
}

export async function saveRegistration(record) {
  const r = await fetch(objectUrl(record.company.inn), {
    method: 'PUT',
    headers: { 'X-YaCloud-SubjectToken': await iamToken(), 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(record, null, 2),
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error(`Object Storage: запись ${r.status}`);
  return record;
}
