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
  const text = `Здравствуйте, ${r.contact.name}!\n\nЗаявка ${r.id} на партнёрство для «${r.company.name}» (ИНН ${r.company.inn}) принята. Менеджер проверит организацию и свяжется с вами. Когда доступ к партнёрским ценам будет открыт, мы пришлём письмо на этот адрес.\n\nОтправка заявки не является заключением договора.\n\nAPEXWOLT · idea@apexwolt.ru · +7 (933) 023-88-43`;
  return {
    to: r.contact.email,
    replyTo: managers()[0],
    subject: `Заявка ${r.id} принята — APEXWOLT`,
    text,
    html: layout('Заявка принята', `<p style="font-size:15px;line-height:1.5">Здравствуйте, ${esc(r.contact.name)}!</p>
<p style="font-size:15px;line-height:1.5">Заявка <b>${esc(r.id)}</b> на партнёрство для «${esc(r.company.name)}» (ИНН ${esc(r.company.inn)}) принята. Менеджер проверит организацию и свяжется с вами. Когда доступ к партнёрским ценам будет открыт, мы пришлём письмо на этот адрес.</p>
<p style="font-size:13px;color:#667;line-height:1.5">Отправка заявки не является заключением договора.<br>APEXWOLT · idea@apexwolt.ru · +7 (933) 023-88-43</p>`)
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
