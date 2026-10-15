// API регистрации партнёров. Переносимый обработчик: локально через server.mjs,
// в проде — Yandex Cloud Function за API Gateway (event.httpMethod / path / queryStringParameters / body).
//
//   GET  /api/health                 — проверка
//   GET  /api/company?inn=…          — реквизиты по ИНН (DaData)
//   POST /api/register               — заявка на регистрацию партнёра (статус «на проверке»)
import crypto from 'node:crypto';
import { isValidInn } from './inn.mjs';
import { findPartyByInn, MOCK_PARTIES } from './dadata.mjs';
import { findRegistrationByInn, saveRegistration } from './store.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()-]{10,20}$/;

const allowedOrigins = () => (process.env.ALLOWED_ORIGINS || 'http://localhost:4180,https://b2b.apexwoltshop.ru,http://b2b.apexwoltshop.ru')
  .split(',').map(s => s.trim()).filter(Boolean);

const reply = (statusCode, body, origin) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(origin && allowedOrigins().includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  },
  body: JSON.stringify(body)
});

// Защита лимита DaData от перебора: кеш ответов и ограничение частоты по IP (в памяти экземпляра).
const cache = new Map();
const hits = new Map();
const RATE_LIMIT = 20; // запросов ИНН в минуту с одного адреса
const tooMany = ip => {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_LIMIT;
};

async function lookupCompany(inn) {
  if (cache.has(inn)) return cache.get(inn);
  let party;
  if (process.env.DADATA_MOCK === '1') party = MOCK_PARTIES[inn] || null;
  else {
    if (!process.env.DADATA_TOKEN) throw Object.assign(new Error('Сервис поиска по ИНН не настроен'), { code: 'config' });
    party = await findPartyByInn(inn, process.env.DADATA_TOKEN);
  }
  cache.set(inn, party);
  return party;
}

const clean = v => String(v ?? '').trim();

function validateRegistration(b) {
  const errors = {};
  const inn = clean(b.inn);
  if (!isValidInn(inn)) errors.inn = 'Проверьте ИНН: 10 цифр для организации или 12 для ИП';
  if (clean(b.companyName).length < 2) errors.companyName = 'Укажите название организации';
  if (clean(b.contactName).length < 2) errors.contactName = 'Укажите контактное лицо';
  if (!EMAIL_RE.test(clean(b.email))) errors.email = 'Проверьте email';
  if (!PHONE_RE.test(clean(b.phone))) errors.phone = 'Проверьте телефон';
  if (b.consent !== true) errors.consent = 'Нужно согласие на обработку персональных данных';
  return errors;
}

export async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const path = (event.path || event.url || '').split('?')[0].replace(/\/+$/, '');
  const query = event.queryStringParameters || {};
  const ip = event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for'] || 'local';

  if (method === 'OPTIONS') return reply(204, {}, origin);

  try {
    if (method === 'GET' && path.endsWith('/api/health')) return reply(200, { ok: true }, origin);

    if (method === 'GET' && path.endsWith('/api/company')) {
      const inn = clean(query.inn);
      if (!isValidInn(inn)) return reply(400, { ok: false, error: 'Проверьте ИНН: 10 цифр для организации или 12 для ИП' }, origin);
      if (tooMany(ip)) return reply(429, { ok: false, error: 'Слишком много запросов, попробуйте через минуту' }, origin);
      const company = await lookupCompany(inn);
      if (!company) return reply(404, { ok: false, error: 'Организация с таким ИНН не найдена' }, origin);
      return reply(200, { ok: true, company }, origin);
    }

    if (method === 'POST' && path.endsWith('/api/register')) {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return reply(400, { ok: false, error: 'Некорректный запрос' }, origin); }
      const errors = validateRegistration(body);
      if (Object.keys(errors).length) return reply(422, { ok: false, error: 'Проверьте поля формы', errors }, origin);
      const inn = clean(body.inn);
      const existing = await findRegistrationByInn(inn);
      if (existing) return reply(409, { ok: false, error: 'Заявка для этой организации уже подана — менеджер свяжется с вами', status: existing.status }, origin);
      const record = {
        id: `REG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        createdAt: new Date().toISOString(),
        status: 'pending',
        company: { inn, kpp: clean(body.kpp), ogrn: clean(body.ogrn), name: clean(body.companyName), address: clean(body.address) },
        contact: { name: clean(body.contactName), position: clean(body.position), email: clean(body.email).toLowerCase(), phone: clean(body.phone) },
        comment: clean(body.comment).slice(0, 1000),
        consent: { personalData: true, at: new Date().toISOString(), ip },
        coefficient: null // ставит менеджер при одобрении
      };
      await saveRegistration(record);
      console.log(`[register] новая заявка ${record.id}: ${record.company.name} (ИНН ${inn})`);
      return reply(201, { ok: true, id: record.id, status: record.status }, origin);
    }

    return reply(404, { ok: false, error: 'Не найдено' }, origin);
  } catch (e) {
    const status = e.code === 'config' ? 503 : e.code === 'limit' ? 429 : 502;
    console.error('[api]', e.message);
    return reply(status, { ok: false, error: e.code === 'config' ? e.message : 'Сервис временно недоступен, попробуйте позже' }, origin);
  }
}
