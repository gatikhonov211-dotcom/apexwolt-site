// Письма по заявке партнёра: уведомление менеджерам и подтверждение клиенту.
// Настройки — только в окружении (backend/.env или переменные функции), не в Git:
//   MANAGER_EMAILS  — адреса менеджеров через запятую
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM — SMTP (Yandex Cloud Postbox или почтовый ящик)
//   MAIL_MOCK=1     — не отправлять, а сохранять письма в backend/data/outbox (.eml) для проверки
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const outboxDir = () => path.join(process.env.REG_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data'), 'outbox');
const managers = () => (process.env.MANAGER_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let transport;
function getTransport() {
  if (transport) return transport;
  if (process.env.MAIL_MOCK === '1') transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  else if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transport || null;
}

async function send(message) {
  const t = getTransport();
  if (!t) { console.warn('[mail] SMTP не настроен — письмо не отправлено:', message.subject); return false; }
  const info = await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, ...message });
  if (process.env.MAIL_MOCK === '1') {
    fs.mkdirSync(outboxDir(), { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}.eml`;
    fs.writeFileSync(path.join(outboxDir(), name), info.message);
  }
  return true;
}

const rows = r => [
  ['Номер заявки', r.id],
  ['Организация', r.company.name],
  ['ИНН', r.company.inn],
  ['КПП', r.company.kpp],
  ['ОГРН', r.company.ogrn],
  ['Адрес', r.company.address],
  ['Контактное лицо', r.contact.name],
  ['Должность', r.contact.position],
  ['Email', r.contact.email],
  ['Телефон', r.contact.phone],
  ['Комментарий', r.comment],
  ['Дата', new Date(r.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' (МСК)']
].filter(([, v]) => v);

const layout = (title, inner) => `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:12px;padding:28px">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;color:#1f5eff;font-weight:bold">APEXWOLT B2B</p>
<h1 style="margin:0 0 16px;font-size:20px">${esc(title)}</h1>${inner}</div></div></body></html>`;

export function managerMessage(r) {
  const table = rows(r).map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#667;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('');
  return {
    to: managers(),
    replyTo: r.contact.email,
    subject: `Новая заявка партнёра ${r.id}: ${r.company.name}`,
    text: `Новая заявка на партнёрство\n\n${rows(r).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nСтатус: на проверке. Ответить клиенту можно прямо на это письмо.`,
    html: layout('Новая заявка на партнёрство', `<table style="border-collapse:collapse;font-size:14px">${table}</table>
<p style="margin:20px 0 0;font-size:13px;color:#667">Статус: на проверке. Ответить клиенту можно прямо на это письмо.</p>`)
  };
}

export function clientMessage(r) {
  const text = `Здравствуйте, ${r.contact.name}!\n\nЗаявка ${r.id} на партнёрство для «${r.company.name}» (ИНН ${r.company.inn}) принята. Менеджер проверит организацию и свяжется с вами. Когда доступ к партнёрским ценам будет открыт, мы пришлём письмо на этот адрес.\n\nОтправка заявки не является заключением договора.\n\nAPEXWOLT · idea@apexwolt.ru · 8 908 667-11-94`;
  return {
    to: r.contact.email,
    replyTo: managers()[0],
    subject: `Заявка ${r.id} принята — APEXWOLT`,
    text,
    html: layout('Заявка принята', `<p style="font-size:15px;line-height:1.5">Здравствуйте, ${esc(r.contact.name)}!</p>
<p style="font-size:15px;line-height:1.5">Заявка <b>${esc(r.id)}</b> на партнёрство для «${esc(r.company.name)}» (ИНН ${esc(r.company.inn)}) принята. Менеджер проверит организацию и свяжется с вами. Когда доступ к партнёрским ценам будет открыт, мы пришлём письмо на этот адрес.</p>
<p style="font-size:13px;color:#667;line-height:1.5">Отправка заявки не является заключением договора.<br>APEXWOLT · idea@apexwolt.ru · 8 908 667-11-94</p>`)
  };
}

// Ошибка почты не должна терять заявку: она уже сохранена, сбой только пишем в журнал.
export async function notifyRegistration(r) {
  const jobs = [];
  if (managers().length) jobs.push(send(managerMessage(r)));
  else console.warn('[mail] MANAGER_EMAILS не задан — менеджер не получит уведомление');
  jobs.push(send(clientMessage(r)));
  const results = await Promise.allSettled(jobs);
  for (const x of results) if (x.status === 'rejected') console.error('[mail]', x.reason?.message);
  return results.every(x => x.status === 'fulfilled' && x.value);
}

const siteUrl = () => (process.env.SITE_URL || 'https://b2b.apexwoltshop.ru').replace(/\/+$/, '');

export async function sendLoginCode(email, code) {
  return send({
    to: email,
    subject: `Код входа APEXWOLT B2B: ${code}`,
    text: `Код для входа в кабинет APEXWOLT B2B: ${code}\n\nКод действует 10 минут. Если вы не запрашивали вход, просто удалите это письмо.`,
    html: layout('Код для входа', `<p style="font-size:15px;line-height:1.5">Введите этот код на странице входа:</p>
<p style="font-size:32px;letter-spacing:.3em;font-weight:bold;margin:8px 0 16px">${esc(code)}</p>
<p style="font-size:13px;color:#667;line-height:1.5">Код действует 10 минут. Если вы не запрашивали вход, просто удалите это письмо.</p>`)
  });
}

export async function sendAccessGranted(r) {
  const link = `${siteUrl()}/login.html`;
  return send({
    to: r.contact.email,
    replyTo: managers()[0],
    subject: 'Доступ к партнёрским ценам открыт — APEXWOLT',
    text: `Здравствуйте, ${r.contact.name}!\n\nЗаявка ${r.id} для «${r.company.name}» одобрена. Войдите в кабинет по адресу ${link} — укажите ${r.contact.email}, и мы пришлём код. После входа в каталоге будут видны ваши партнёрские цены.\n\nAPEXWOLT · idea@apexwolt.ru · 8 908 667-11-94`,
    html: layout('Доступ открыт', `<p style="font-size:15px;line-height:1.5">Здравствуйте, ${esc(r.contact.name)}!</p>
<p style="font-size:15px;line-height:1.5">Заявка <b>${esc(r.id)}</b> для «${esc(r.company.name)}» одобрена. После входа в каталоге будут видны ваши партнёрские цены.</p>
<p style="margin:20px 0"><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px">Войти в кабинет</a></p>
<p style="font-size:13px;color:#667;line-height:1.5">Для входа укажите ${esc(r.contact.email)} — мы пришлём одноразовый код.<br>APEXWOLT · idea@apexwolt.ru · 8 908 667-11-94</p>`)
  });
}

// ---------- заявка на товары из корзины ----------
const rub = n => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const orderLines = o => o.items.map((it, i) => {
  const price = it.partnerPrice ?? it.retail;
  return {
    n: i + 1, sku: it.sku, title: it.title || it.sku, qty: it.qty,
    price: price ? rub(price) : 'по запросу', sum: price ? rub(price * it.qty) : '—',
    note: it.partnerPrice != null ? `цена партнёра${it.retail ? `, ${it.retailKind || 'РРЦ'} ${rub(it.retail)}` : ''}` : it.retail ? (it.retailKind || 'РРЦ') : ''
  };
});
const totalLabel = o => o.partner ? 'Итого по ценам партнёра' : 'Итого по МРЦ/РРЦ';
const orderTable = o => `<table style="border-collapse:collapse;font-size:13px;width:100%">
<tr style="color:#667;text-align:left"><th style="padding:6px 6px 6px 0">Товар</th><th style="padding:6px">Кол-во</th><th style="padding:6px">Цена</th><th style="padding:6px 0 6px 6px;text-align:right">Сумма</th></tr>
${orderLines(o).map(l => `<tr style="border-top:1px solid #eee"><td style="padding:8px 6px 8px 0">${esc(l.title)}<br><span style="color:#889">Арт. ${esc(l.sku)}${l.note ? ` · ${esc(l.note)}` : ''}</span></td><td style="padding:8px 6px;white-space:nowrap">${l.qty} шт.</td><td style="padding:8px 6px;white-space:nowrap">${esc(l.price)}</td><td style="padding:8px 0 8px 6px;text-align:right;white-space:nowrap">${esc(l.sum)}</td></tr>`).join('')}
<tr style="border-top:2px solid #111"><td colspan="3" style="padding:10px 6px 0 0;font-weight:bold">${totalLabel(o)}</td><td style="padding:10px 0 0 6px;text-align:right;font-weight:bold;white-space:nowrap">${rub(o.total)}</td></tr></table>`;
const orderText = o => orderLines(o).map(l => `${l.n}. ${l.title} (арт. ${l.sku}) — ${l.qty} шт. × ${l.price} = ${l.sum}${l.note ? ` [${l.note}]` : ''}`).join('\n') + `\n\n${totalLabel(o)}: ${rub(o.total)}`;
const orderInfo = o => [
  ['Организация', o.company.name], ['ИНН', o.company.inn], ['Контактное лицо', o.contact.name],
  ['Телефон', o.contact.phone], ['Email', o.contact.email], ['Комментарий', o.comment],
  ['Партнёр', o.partner ? `да, коэффициент ${String(o.coefficient ?? '—').replace('.', ',')}` : 'нет (гость сайта)'],
  ['Дата', new Date(o.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' (МСК)']
].filter(([, v]) => v);

// Письмо менеджерам и подтверждение клиенту. Заявка уже сохранена — сбой почты только пишем в журнал.
export async function notifyOrder(o) {
  const info = orderInfo(o);
  const jobs = [];
  if (managers().length) jobs.push(send({
    to: managers(), replyTo: o.contact.email,
    subject: `Заявка ${o.id} от ${o.company.name}: ${o.items.length} поз., ${rub(o.total)}`,
    text: `Новая заявка на товары ${o.id}\n\n${info.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${orderText(o)}\n\nОтветить клиенту можно прямо на это письмо. Все заявки: ${siteUrl()}/admin.html`,
    html: layout(`Заявка ${o.id}`, `<table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">${info.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#667;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>${orderTable(o)}
<p style="margin:20px 0 0;font-size:13px;color:#667">Ответить клиенту можно прямо на это письмо. Все заявки — <a href="${esc(siteUrl())}/admin.html">кабинет менеджера</a>.</p>`)
  }));
  else console.warn('[mail] MANAGER_EMAILS не задан — менеджер не получит заявку');
  jobs.push(send({
    to: o.contact.email, replyTo: managers()[0],
    subject: `Заявка ${o.id} принята — APEXWOLT`,
    text: `Здравствуйте, ${o.contact.name}!\n\nЗаявка ${o.id} для «${o.company.name}» принята. Менеджер подтвердит наличие, цены и сроки.\n\n${orderText(o)}\n\nОтправка заявки не является договором или оплатой.\n\nAPEXWOLT · idea@apexwolt.ru · 8 908 667-11-94`,
    html: layout('Заявка принята', `<p style="font-size:15px;line-height:1.5">Здравствуйте, ${esc(o.contact.name)}!</p>
<p style="font-size:15px;line-height:1.5">Заявка <b>${esc(o.id)}</b> для «${esc(o.company.name)}» принята. Менеджер подтвердит наличие, цены и сроки.</p>${orderTable(o)}
<p style="margin-top:18px;font-size:13px;color:#667;line-height:1.5">Отправка заявки не является договором или оплатой.<br>APEXWOLT · idea@apexwolt.ru · 8 908 667-11-94</p>`)
  }));
  const results = await Promise.allSettled(jobs);
  for (const x of results) if (x.status === 'rejected') console.error('[mail]', x.reason?.message);
  return results.every(x => x.status === 'fulfilled' && x.value);
}
