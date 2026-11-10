// Тесты API регистрации: node --test backend/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.REG_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'apx-reg-'));
process.env.DADATA_MOCK = '1';
process.env.MAIL_MOCK = '1';
process.env.AUTH_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.MANAGER_EMAILS = 'manager1@example.com, manager2@example.com';
delete process.env.S3_BUCKET;
const { isValidInn } = await import('./inn.mjs');
const { mapParty, findPartyByInn } = await import('./dadata.mjs');
const { handler } = await import('./api.mjs');

const call = (method, p, { query, body, origin = 'http://localhost:4180', token } = {}) =>
  handler({ httpMethod: method, path: p, queryStringParameters: query, body: body && JSON.stringify(body), headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) } })
    .then(r => ({ ...r, json: r.body ? JSON.parse(r.body) : null }));

test('ИНН: контрольные цифры', () => {
  assert.equal(isValidInn('3817050540'), true);   // ООО «Гранит»
  assert.equal(isValidInn('7707083893'), true);   // ПАО Сбербанк
  assert.equal(isValidInn('3817050541'), false);
  assert.equal(isValidInn('500100732259'), true); // ИП, 12 цифр
  assert.equal(isValidInn('12345'), false);
});

test('DaData: ответ превращается в карточку компании', async () => {
  const sample = { value: 'ООО "ТЕСТ"', data: { inn: '7707083893', kpp: '773601001', ogrn: '1027700132195', type: 'LEGAL',
    name: { short_with_opf: 'ООО "ТЕСТ"', full_with_opf: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ТЕСТ"' },
    address: { value: 'г Москва', unrestricted_value: '117312, г Москва' }, state: { status: 'LIQUIDATED' } } };
  const c = mapParty(sample);
  assert.equal(c.name, 'ООО "ТЕСТ"');
  assert.equal(c.address, '117312, г Москва');
  assert.equal(c.active, false);
  assert.equal(c.statusText, 'ликвидирована');
  const fakeFetch = async (url, opts) => {
    assert.match(opts.headers.Authorization, /^Token /);
    assert.deepEqual(JSON.parse(opts.body), { query: '7707083893', count: 1 });
    return { ok: true, status: 200, json: async () => ({ suggestions: [sample] }) };
  };
  assert.equal((await findPartyByInn('7707083893', 'secret', fakeFetch)).inn, '7707083893');
  await assert.rejects(findPartyByInn('7707083893', 'bad', async () => ({ ok: false, status: 403 })), /токен/);
});

test('GET /api/company: найдено, не найдено, неверный ИНН, CORS', async () => {
  const ok = await call('GET', '/api/company', { query: { inn: '3817050540' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json.company.kpp, '381701001');
  assert.equal(ok.headers['Access-Control-Allow-Origin'], 'http://localhost:4180');
  assert.equal((await call('GET', '/api/company', { query: { inn: '7707083893' } })).statusCode, 404);
  assert.equal((await call('GET', '/api/company', { query: { inn: '123' } })).statusCode, 400);
  const foreign = await call('GET', '/api/company', { query: { inn: '3817050540' }, origin: 'https://evil.example' });
  assert.equal(foreign.headers['Access-Control-Allow-Origin'], undefined);
});

test('POST /api/register: проверка полей, сохранение, повтор', async () => {
  const bad = await call('POST', '/api/register', { body: { inn: '1', email: 'x' } });
  assert.equal(bad.statusCode, 422);
  assert.ok(bad.json.errors.inn && bad.json.errors.email && bad.json.errors.consent);
  const body = { inn: '3817050540', companyName: 'ООО «ГРАНИТ»', contactName: 'Иван Петров', email: 'Buyer@Example.ru', phone: '+7 900 000-00-00', consent: true };
  const ok = await call('POST', '/api/register', { body });
  assert.equal(ok.statusCode, 201);
  assert.match(ok.json.id, /^REG-[0-9A-F]{6}$/);
  assert.equal(ok.json.status, 'pending');
  const saved = JSON.parse(fs.readFileSync(path.join(process.env.REG_DATA_DIR, 'kv', 'registrations', '3817050540.json'), 'utf8'));
  assert.equal(saved.status, 'pending');
  assert.equal(saved.contact.email, 'buyer@example.ru');
  assert.equal(saved.coefficient, null);
  assert.equal((await call('POST', '/api/register', { body })).statusCode, 409);
});

test('Заявка: письмо менеджерам и подтверждение клиенту', async () => {
  const outbox = path.join(process.env.REG_DATA_DIR, 'outbox');
  const before = fs.existsSync(outbox) ? fs.readdirSync(outbox).length : 0;
  const r = await call('POST', '/api/register', { body: {
    inn: '7707083893', companyName: 'ПАО Сбербанк <test>', contactName: 'Тест Тестов', email: 'client@example.com',
    phone: '+7 900 000-00-00', consent: true } });
  assert.equal(r.statusCode, 201);
  const mails = fs.readdirSync(outbox).slice(before).map(f => fs.readFileSync(path.join(outbox, f), 'utf8'));
  assert.equal(mails.length, 2);
  const toManager = mails.find(m => /manager1@example\.com, manager2@example\.com/.test(m));
  const toClient = mails.find(m => /^To: client@example\.com/m.test(m));
  assert.ok(toManager, 'письмо менеджерам');
  assert.ok(toClient, 'подтверждение клиенту');
  assert.match(toManager, /Reply-To: client@example\.com/);
  assert.match(toManager, /&lt;test&gt;/); // HTML экранируется
});

const { issueCode, signToken } = await import('./auth.mjs');
const login = async email => {
  const { code } = await issueCode(email, Date.now() + 120_000); // в обход паузы между письмами
  const r = await call('POST', '/api/auth/verify', { body: { email, code } });
  return r;
};

test('Вход: код только менеджеру и одобренному партнёру, неверный код, подделанный токен', async () => {
  const outbox = path.join(process.env.REG_DATA_DIR, 'outbox');
  const before = fs.readdirSync(outbox).length;
  const stranger = await call('POST', '/api/auth/request', { body: { email: 'nobody@example.com' } });
  assert.equal(stranger.statusCode, 200);
  assert.equal(fs.readdirSync(outbox).length, before, 'незнакомцу письмо не уходит');
  const mgr = await call('POST', '/api/auth/request', { body: { email: 'Manager1@example.com' } });
  assert.equal(mgr.statusCode, 200);
  assert.equal(fs.readdirSync(outbox).length, before + 1, 'менеджеру уходит код');
  assert.equal((await call('POST', '/api/auth/request', { body: { email: 'manager1@example.com' } })).statusCode, 429, 'не чаще раза в минуту');
  assert.equal((await call('POST', '/api/auth/verify', { body: { email: 'manager1@example.com', code: '000000' } })).statusCode, 401);
  const ok = await login('manager1@example.com');
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json.user.role, 'manager');
  assert.equal((await call('GET', '/api/me', { token: ok.json.token })).json.user.email, 'manager1@example.com');
  const forged = ok.json.token.replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
  assert.equal((await call('GET', '/api/me', { token: forged })).statusCode, 401);
  assert.equal((await call('GET', '/api/admin/registrations')).statusCode, 401);
  // самозванец с чужой подписью не становится менеджером
  assert.equal((await call('GET', '/api/admin/registrations', { token: signToken({ sub: 'nobody@example.com', role: 'manager' }) })).statusCode, 401);
});

test('Менеджер одобряет заявку, партнёр входит и видит цены = закупка × коэффициент', async () => {
  const manager = (await login('manager2@example.com')).json.token;
  const list = await call('GET', '/api/admin/registrations', { token: manager });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json.registrations.some(r => r.company.inn === '3817050540'));

  // до одобрения партнёру код не уходит и войти нельзя
  assert.equal((await login('buyer@example.ru')).statusCode, 403);

  assert.equal((await call('POST', '/api/admin/registrations/3817050540', { token: manager, body: { action: 'approve', coefficient: '9' } })).statusCode, 422);
  const approved = await call('POST', '/api/admin/registrations/3817050540', { token: manager, body: { action: 'approve', coefficient: '1,15' } });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json.registration.status, 'approved');
  assert.equal(approved.json.registration.coefficient, 1.15);

  assert.equal((await call('PUT', '/api/admin/costs', { token: manager, body: { costs: { '7/14/04': '3118,75', '9/01/02': 1496, bad: 'x' }, source: 'Матрица.xlsx' } })).json.count, 2);

  const partner = await login('buyer@example.ru');
  assert.equal(partner.statusCode, 200);
  assert.equal(partner.json.user.role, 'partner');
  assert.equal(partner.json.user.company.inn, '3817050540');
  const prices = await call('GET', '/api/prices', { token: partner.json.token });
  assert.deepEqual(prices.json.prices, { '7/14/04': Math.round(3118.75 * 1.15), '9/01/02': Math.round(1496 * 1.15) });
  assert.equal(prices.json.coefficient, undefined, 'коэффициент партнёру не отдаётся');
  assert.equal(prices.json.costs, undefined, 'закупочная стоимость партнёру не отдаётся');
  assert.equal((await call('GET', '/api/admin/costs', { token: partner.json.token })).statusCode, 403);
  assert.equal((await call('GET', '/api/prices', { token: manager })).statusCode, 403);

  // отклонение закрывает доступ уже выданному токену
  await call('POST', '/api/admin/registrations/3817050540', { token: manager, body: { action: 'reject' } });
  assert.equal((await call('GET', '/api/prices', { token: partner.json.token })).statusCode, 401);
});
