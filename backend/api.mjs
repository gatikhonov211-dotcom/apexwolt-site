// API B2B-платформы APEXWOLT. Переносимый обработчик: локально через server.mjs,
// в проде — Yandex Cloud Function за API Gateway (event.httpMethod / url / queryStringParameters / body).
//
//   GET  /api/health                         — проверка
//   GET  /api/company?inn=…                  — реквизиты по ИНН (DaData)
//   POST /api/register                       — заявка партнёра (статус «на проверке»)
//   POST /api/auth/request   {email}         — код входа на почту (партнёр после одобрения или менеджер)
//   POST /api/auth/verify    {email, code}   — токен сессии
//   POST /api/auth/login     {email, password} — вход по паролю (если пользователь его задал)
//   POST /api/auth/password  {password}      — задать или сменить пароль (нужен вход)
//   GET  /api/me                             — кто вошёл
//   GET  /api/prices                         — цены партнёра: закупка × коэффициент организации
//   GET  /api/admin/registrations            — заявки (менеджер)
//   POST /api/admin/registrations/<ИНН>      — {action: approve|reject|update, coefficient}
//   GET  /api/admin/costs                    — сведения о загруженной закупочной стоимости
//   PUT  /api/admin/costs    {costs, source} — загрузить закупочную стоимость {артикул: цена}
//   POST /api/orders                         — заявка на товары из корзины (гость или партнёр; цены партнёра считает сервер)
//   GET  /api/admin/orders                   — заявки на товары (менеджер)
//   POST /api/admin/orders/<номер>  {status} — статус заявки: new | work | done
import crypto from 'node:crypto';
import { isValidInn } from './inn.mjs';
import { findPartyByInn, MOCK_PARTIES } from './dadata.mjs';
import { findRegistrationByInn, getRegistration, saveRegistration, listRegistrations, getUser, saveUser, removeUser, getCosts, saveCosts, saveOrder, listOrders, findOrder } from './store.mjs';
import { notifyRegistration, sendLoginCode, sendAccessGranted, notifyOrder } from './mailer.mjs';
import { normalizeEmail, emailKey, isManager, issueCode, checkCode, signToken, verifyToken, passwordProblem, hasPassword, setPassword, checkPassword, removePassword } from './auth.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()-]{10,20}$/;
export const COEFFICIENT_MIN = 0.5;
export const COEFFICIENT_MAX = 5;

const allowedOrigins = () => (process.env.ALLOWED_ORIGINS || 'http://localhost:4180,https://b2b.apexwoltshop.ru,http://b2b.apexwoltshop.ru')
  .split(',').map(s => s.trim()).filter(Boolean);

const reply = (statusCode, body, origin) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(origin && allowedOrigins().includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600'
  },
  body: JSON.stringify(body)
});

const httpError = (status, message, extra) => Object.assign(new Error(message), { status, extra });

// Защита лимита DaData и почты от перебора: кеш ответов и ограничение частоты по IP (в памяти экземпляра).
const cache = new Map();
const hits = new Map();
const tooMany = (ip, bucket, limit) => {
  const now = Date.now();
  const id = `${bucket}:${ip}`;
  const list = (hits.get(id) || []).filter(t => now - t < 60_000);
  list.push(now);
  hits.set(id, list);
  return list.length > limit;
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

// Кто вошёл: токен + актуальные права (менеджер из MANAGER_EMAILS, партнёр — одобренная организация).
async function sessionOf(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const payload = verifyToken(auth.replace(/^Bearer\s+/i, ''));
  if (!payload) return null;
  if (payload.role === 'manager') return isManager(payload.sub) ? { role: 'manager', email: payload.sub } : null;
  const user = await getUser(emailKey(payload.sub));
  if (!user) return null;
  const reg = await getRegistration(user.inn);
  if (!reg || reg.status !== 'approved') return null;
  return { role: 'partner', email: payload.sub, registration: reg };
}

const requireRole = async (event, role) => {
  const s = await sessionOf(event);
  if (!s) throw httpError(401, 'Войдите заново');
  if (s.role !== role) throw httpError(403, 'Недостаточно прав');
  return s;
};

const publicCompany = reg => ({
  id: reg.id, status: reg.status, name: reg.company.name, inn: reg.company.inn,
  contact: reg.contact.name, position: reg.contact.position || '', email: reg.contact.email, phone: reg.contact.phone
});

const userView = async s => ({ role: s.role, email: s.email, company: s.registration ? publicCompany(s.registration) : null, hasPassword: await hasPassword(s.email) });

// Выдать токен после проверки кода или пароля: права (менеджер / одобренный партнёр) проверяются заново.
async function startSession(email) {
  const role = isManager(email) ? 'manager' : 'partner';
  const token = signToken({ sub: email, role });
  const session = await sessionOf({ headers: { authorization: `Bearer ${token}` } });
  if (!session) throw httpError(403, 'Доступ к кабинету закрыт — свяжитесь с менеджером');
  return { ok: true, token, user: await userView(session) };
}

const coefficientOf = v => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= COEFFICIENT_MIN && n <= COEFFICIENT_MAX ? Math.round(n * 1000) / 1000 : null;
};

const routes = {
  'GET health': async () => ({ ok: true }),

  'GET company': async ({ query, ip }) => {
    const inn = clean(query.inn);
    if (!isValidInn(inn)) throw httpError(400, 'Проверьте ИНН: 10 цифр для организации или 12 для ИП');
    if (tooMany(ip, 'inn', 20)) throw httpError(429, 'Слишком много запросов, попробуйте через минуту');
    const company = await lookupCompany(inn);
    if (!company) throw httpError(404, 'Организация с таким ИНН не найдена');
    return { ok: true, company };
  },

  'POST register': async ({ body, ip }) => {
    const errors = validateRegistration(body);
    if (Object.keys(errors).length) throw httpError(422, 'Проверьте поля формы', { errors });
    const inn = clean(body.inn);
    const existing = await findRegistrationByInn(inn);
    if (existing) throw httpError(409, 'Заявка для этой организации уже подана — менеджер свяжется с вами', { status: existing.status });
    const record = {
      id: `REG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      createdAt: new Date().toISOString(),
      status: 'pending',
      company: { inn, kpp: clean(body.kpp), ogrn: clean(body.ogrn), name: clean(body.companyName), address: clean(body.address) },
      contact: { name: clean(body.contactName), position: clean(body.position), email: normalizeEmail(body.email), phone: clean(body.phone) },
      comment: clean(body.comment).slice(0, 1000),
      consent: { personalData: true, at: new Date().toISOString(), ip },
      coefficient: null // ставит менеджер при одобрении
    };
    await saveRegistration(record);
    console.log(`[register] новая заявка ${record.id}`);
    await notifyRegistration(record).catch(e => console.error('[mail]', e.message));
    return { httpStatus: 201, ok: true, id: record.id, status: record.status };
  },

  'POST auth/request': async ({ body, ip }) => {
    const email = normalizeEmail(body.email);
    if (!EMAIL_RE.test(email)) throw httpError(422, 'Проверьте email');
    if (tooMany(ip, 'auth', 10)) throw httpError(429, 'Слишком много запросов, попробуйте через минуту');
    // Код уходит только менеджеру или одобренному партнёру; ответ одинаковый, чтобы не раскрывать, кто зарегистрирован.
    const allowed = isManager(email) || Boolean(await getUser(emailKey(email)));
    if (allowed) {
      const res = await issueCode(email);
      if (res.wait) throw httpError(429, `Код уже отправлен. Повторно — через ${res.wait} с`);
      const sent = await sendLoginCode(email, res.code);
      if (!sent) throw Object.assign(new Error('Почта временно недоступна'), { code: 'config' });
    }
    return { ok: true, message: 'Если адрес подключён к кабинету, на него придёт код. Проверьте почту и папку «Спам».' };
  },

  'POST auth/verify': async ({ body, ip }) => {
    const email = normalizeEmail(body.email);
    const code = clean(body.code);
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) throw httpError(422, 'Введите 6 цифр из письма');
    if (tooMany(ip, 'verify', 20)) throw httpError(429, 'Слишком много попыток, подождите минуту');
    const result = await checkCode(email, code);
    if (result !== true) throw httpError(401, result);
    return startSession(email);
  },

  'POST auth/login': async ({ body, ip }) => {
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? '');
    if (!EMAIL_RE.test(email) || !password) throw httpError(422, 'Введите email и пароль');
    if (password.length > 256) throw httpError(401, 'Неверный email или пароль');
    if (tooMany(ip, 'login', 20)) throw httpError(429, 'Слишком много попыток, подождите минуту');
    const result = await checkPassword(email, password);
    if (result !== true) throw httpError(401, result);
    return startSession(email);
  },

  'POST auth/password': async ({ event, body }) => {
    const s = await sessionOf(event);
    if (!s) throw httpError(401, 'Войдите заново');
    const problem = passwordProblem(body.password);
    if (problem) throw httpError(422, problem);
    await setPassword(s.email, body.password);
    console.log(`[auth] пароль задан (${s.role})`);
    return { ok: true, user: await userView(s) };
  },

  'GET me': async ({ event }) => {
    const s = await sessionOf(event);
    if (!s) throw httpError(401, 'Войдите заново');
    return { ok: true, user: await userView(s) };
  },

  'GET prices': async ({ event }) => {
    const s = await requireRole(event, 'partner');
    const k = s.registration.coefficient;
    const { costs, updatedAt } = await getCosts();
    const prices = {};
    if (k) for (const [sku, cost] of Object.entries(costs)) prices[sku] = Math.round(cost * k);
    return { ok: true, prices, updatedAt, ready: Boolean(k) && Object.keys(prices).length > 0 };
  },

  'GET admin/registrations': async ({ event }) => {
    await requireRole(event, 'manager');
    return { ok: true, registrations: await listRegistrations() };
  },

  'POST admin/registrations/:inn': async ({ event, body, param }) => {
    const s = await requireRole(event, 'manager');
    const reg = await getRegistration(param);
    if (!reg) throw httpError(404, 'Заявка не найдена');
    const action = clean(body.action);
    const key = emailKey(reg.contact.email);
    const now = new Date().toISOString();
    if (action === 'approve' || action === 'update') {
      const k = coefficientOf(body.coefficient);
      if (!k) throw httpError(422, `Коэффициент — число от ${COEFFICIENT_MIN} до ${COEFFICIENT_MAX}, например 1,15`);
      const wasApproved = reg.status === 'approved';
      Object.assign(reg, { status: 'approved', coefficient: k, decidedAt: wasApproved ? reg.decidedAt : now, decidedBy: wasApproved ? reg.decidedBy : s.email, updatedAt: now });
      await saveRegistration(reg);
      await saveUser(key, { email: reg.contact.email, inn: reg.company.inn, role: 'partner' });
      if (!wasApproved) await sendAccessGranted(reg).catch(e => console.error('[mail]', e.message));
    } else if (action === 'reject') {
      Object.assign(reg, { status: 'rejected', decidedAt: now, decidedBy: s.email, updatedAt: now });
      await saveRegistration(reg);
      await removeUser(key);
      await removePassword(reg.contact.email);
    } else throw httpError(422, 'Неизвестное действие');
    console.log(`[admin] ${s.email}: ${action} ${reg.id}`);
    return { ok: true, registration: reg };
  },

  'POST orders': async ({ event, body, ip }) => {
    if (tooMany(ip, 'order', 5)) throw httpError(429, 'Слишком много заявок подряд — подождите минуту');
    const s = await sessionOf(event);
    const partner = s?.role === 'partner' ? s : null;
    const errors = {};
    const items = Array.isArray(body.items) ? body.items.slice(0, 300).map(it => ({
      sku: clean(it?.sku).slice(0, 60), title: clean(it?.title).slice(0, 300), qty: Math.floor(Number(it?.qty)),
      retail: Number(it?.retail) > 0 ? Math.round(Number(it.retail)) : null,
      retailKind: ['МРЦ', 'РРЦ'].includes(it?.retailKind) ? it.retailKind : null
    })).filter(it => it.sku && it.qty >= 1 && it.qty <= 9999) : [];
    if (!items.length) errors.items = 'В заявке нет позиций';
    // Партнёр: организация и ИНН — из его одобренной заявки, не из формы.
    const company = partner ? { name: partner.registration.company.name, inn: partner.registration.company.inn }
      : { name: clean(body.company).slice(0, 300), inn: clean(body.inn) };
    if (!partner && company.name.length < 2) errors.company = 'Укажите организацию';
    if (!partner && !isValidInn(company.inn)) errors.inn = 'Проверьте ИНН: 10 цифр для организации или 12 для ИП';
    const contact = { name: clean(body.name).slice(0, 200), phone: clean(body.phone).slice(0, 40), email: normalizeEmail(body.email) };
    if (contact.name.length < 2) errors.name = 'Укажите контактное лицо';
    if (!PHONE_RE.test(contact.phone)) errors.phone = 'Проверьте телефон';
    if (!EMAIL_RE.test(contact.email)) errors.email = 'Проверьте email';
    if (body.consent !== true) errors.consent = 'Нужно согласие на обработку данных';
    if (Object.keys(errors).length) throw httpError(422, Object.values(errors)[0], { errors });
    // Цены партнёра — только с сервера: закупочная стоимость × коэффициент организации.
    const k = partner?.registration.coefficient || null;
    const { costs } = k ? await getCosts() : { costs: {} };
    for (const it of items) it.partnerPrice = k && costs[it.sku] ? Math.round(costs[it.sku] * k) : null;
    const total = items.reduce((sum, it) => sum + (it.partnerPrice ?? it.retail ?? 0) * it.qty, 0);
    const now = new Date();
    const order = {
      id: `AW-${now.toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      createdAt: now.toISOString(), status: 'new', partner: Boolean(partner), coefficient: k,
      company, contact, comment: clean(body.comment).slice(0, 1000),
      items, total, consent: { at: now.toISOString(), ip }
    };
    await saveOrder(order);
    console.log(`[order] ${order.id}: ${items.length} поз., партнёр: ${order.partner}`);
    const mailed = await notifyOrder(order).catch(e => { console.error('[mail]', e.message); return false; });
    return { httpStatus: 201, ok: true, id: order.id, total, partner: order.partner, mailed };
  },

  'GET admin/orders': async ({ event }) => {
    await requireRole(event, 'manager');
    return { ok: true, orders: (await listOrders()).map(({ key, consent, ...o }) => o) };
  },

  'POST admin/orders/:id': async ({ event, body, param }) => {
    const s = await requireRole(event, 'manager');
    if (!['new', 'work', 'done'].includes(body.status)) throw httpError(422, 'Неизвестный статус');
    const order = await findOrder(param);
    if (!order) throw httpError(404, 'Заявка не найдена');
    Object.assign(order, { status: body.status, statusBy: s.email, statusAt: new Date().toISOString() });
    await saveOrder(order);
    const { key, consent, ...rest } = order;
    return { ok: true, order: rest };
  },

  'GET admin/costs': async ({ event }) => {
    await requireRole(event, 'manager');
    const { count, updatedAt, source, updatedBy } = await getCosts();
    return { ok: true, count, updatedAt, source, updatedBy };
  },

  'PUT admin/costs': async ({ event, body }) => {
    const s = await requireRole(event, 'manager');
    const input = body.costs && typeof body.costs === 'object' ? body.costs : null;
    if (!input) throw httpError(422, 'Нет данных о закупочной стоимости');
    const costs = {};
    for (const [sku, v] of Object.entries(input)) {
      const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
      if (clean(sku) && Number.isFinite(n) && n > 0) costs[clean(sku)] = Math.round(n * 100) / 100;
    }
    const count = Object.keys(costs).length;
    if (!count) throw httpError(422, 'В файле не найдено ни одной цены');
    const doc = { costs, count, updatedAt: new Date().toISOString(), updatedBy: s.email, source: clean(body.source).slice(0, 200) };
    await saveCosts(doc);
    console.log(`[admin] ${s.email}: закупочная стоимость, ${count} позиций`);
    return { ok: true, count, updatedAt: doc.updatedAt };
  }
};

function matchRoute(method, route) {
  if (routes[`${method} ${route}`]) return { fn: routes[`${method} ${route}`] };
  const m = route.match(/^admin\/registrations\/(\d{10}|\d{12})$/);
  if (m && routes[`${method} admin/registrations/:inn`]) return { fn: routes[`${method} admin/registrations/:inn`], param: m[1] };
  const o = route.match(/^admin\/orders\/(AW-\d{6}-[0-9A-F]{4})$/);
  if (o && routes[`${method} admin/orders/:id`]) return { fn: routes[`${method} admin/orders/:id`], param: o[1] };
  return null;
}

export async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const path = (event.url || event.path || '').split('?')[0].replace(/\/+$/, '');
  const route = path.replace(/^.*?\/api\/?/, '');
  const query = event.queryStringParameters || {};
  const ip = event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for'] || 'local';

  if (method === 'OPTIONS') return reply(204, {}, origin);
  const match = matchRoute(method, route);
  if (!match) return reply(404, { ok: false, error: 'Не найдено' }, origin);

  try {
    let body = {};
    if (method === 'POST' || method === 'PUT') {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '{}';
      if (raw.length > 2_000_000) throw httpError(413, 'Слишком большой запрос');
      try { body = JSON.parse(raw || '{}'); } catch { throw httpError(400, 'Некорректный запрос'); }
    }
    const result = await match.fn({ event, query, body, ip, param: match.param });
    const { httpStatus = 200, ...rest } = result;
    return reply(httpStatus, rest, origin);
  } catch (e) {
    if (e.status) return reply(e.status, { ok: false, error: e.message, ...(e.extra || {}) }, origin);
    const status = e.code === 'config' ? 503 : 502;
    console.error('[api]', e.message);
    return reply(status, { ok: false, error: e.code === 'config' ? e.message : 'Сервис временно недоступен, попробуйте позже' }, origin);
  }
}
