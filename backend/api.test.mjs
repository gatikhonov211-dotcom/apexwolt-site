// Тесты API регистрации: node --test backend/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.REG_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'apx-reg-'));
process.env.DADATA_MOCK = '1';
const { isValidInn } = await import('./inn.mjs');
const { mapParty, findPartyByInn } = await import('./dadata.mjs');
const { handler } = await import('./api.mjs');

const call = (method, p, { query, body, origin = 'http://localhost:4180' } = {}) =>
  handler({ httpMethod: method, path: p, queryStringParameters: query, body: body && JSON.stringify(body), headers: { origin } })
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
  const saved = JSON.parse(fs.readFileSync(path.join(process.env.REG_DATA_DIR, 'registrations.json'), 'utf8'));
  assert.equal(saved[0].status, 'pending');
  assert.equal(saved[0].contact.email, 'buyer@example.ru');
  assert.equal(saved[0].coefficient, null);
  assert.equal((await call('POST', '/api/register', { body })).statusCode, 409);
});

test('Заявка: письмо менеджерам и подтверждение клиенту', async () => {
  process.env.MAIL_MOCK = '1';
  process.env.MANAGER_EMAILS = 'manager1@example.com, manager2@example.com';
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
