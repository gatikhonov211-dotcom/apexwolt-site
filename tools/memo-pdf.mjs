// PDF-памятка из INFRASTRUCTURE.md: Markdown → HTML (шрифт Golos Text сайта) → PDF через headless Chrome/Edge.
//   node tools/memo-pdf.mjs [выход=APEXWOLT-памятка.pdf] — PDF не кладите в папку сайта (иначе он уйдёт в публикацию)
// CHROME — путь к браузеру, по умолчанию Chrome, затем Edge.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'APEXWOLT-памятка.pdf'));
const md = fs.readFileSync(path.join(root, 'INFRASTRUCTURE.md'), 'utf8').replace(/\r/g, '');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
  .replace(/(^|[\s(])(https:\/\/[^\s)<,]+)/g, '$1<a href="$2">$2</a>');

const lines = md.split('\n');
let html = '';
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/^```/.test(l)) {
    const code = [];
    while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
    html += `<pre>${esc(code.join('\n'))}</pre>`;
  } else if (/^\|/.test(l)) {
    const rows = [];
    for (; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(lines[i]);
    i--;
    const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const [head, , ...body] = rows;
    html += `<table><thead><tr>${cells(head).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  } else if (/^- /.test(l)) {
    const items = [];
    for (; i < lines.length && /^- /.test(lines[i]); i++) items.push(lines[i].slice(2));
    i--;
    html += `<ul>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`;
  } else if (/^# /.test(l)) html += `<h1>${inline(l.slice(2))}</h1>`;
  else if (/^## /.test(l)) html += `<h2>${inline(l.slice(3))}</h2>`;
  else if (/^### /.test(l)) html += `<h3>${inline(l.slice(4))}</h3>`;
  else if (l.trim()) {
    const para = [l];
    while (lines[i + 1]?.trim() && !/^(#|\||- |```)/.test(lines[i + 1])) para.push(lines[++i]);
    html += `<p>${inline(para.join(' '))}</p>`;
  }
}

const font = pathToFileURL(path.join(root, 'assets', 'fonts', 'GolosText-Variable.ttf')).href;
const date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>APEXWOLT B2B — памятка</title><style>
@font-face{font-family:Golos;src:url("${font}")}
@page{size:A4;margin:16mm 14mm 16mm}
body{font-family:Golos,Arial,sans-serif;color:#15171c;font-size:10pt;line-height:1.45}
.top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #15171c;padding-bottom:6px;margin-bottom:4px}
.brand{font-weight:800;letter-spacing:.08em;font-size:9pt;color:#2f63ff}.date{color:#6b7080;font-size:8.5pt}
h1{font-size:20pt;margin:10px 0 6px;letter-spacing:-.02em}
h2{font-size:13pt;margin:18px 0 6px;padding-top:4px;break-after:avoid}
h3{font-size:11pt;margin:12px 0 4px;break-after:avoid}
p{margin:5px 0}ul{margin:5px 0;padding-left:18px}li{margin:2px 0}
table{width:100%;border-collapse:collapse;margin:6px 0 8px;font-size:8.8pt;break-inside:auto}
tr{break-inside:avoid}th{text-align:left;background:#f1f3f7;font-weight:700}
th,td{border:1px solid #dde0e7;padding:5px 7px;vertical-align:top}
code{font-family:Consolas,monospace;font-size:8.6pt;background:#f1f3f7;border-radius:3px;padding:0 3px;word-break:break-all}
pre{font-family:Consolas,monospace;font-size:8.4pt;background:#f1f3f7;border-radius:6px;padding:8px 10px;white-space:pre-wrap;break-inside:avoid}
a{color:#2f63ff;text-decoration:none}b{font-weight:700}
</style></head><body><div class="top"><span class="brand">APEXWOLT B2B</span><span class="date">${date}</span></div>${html}</body></html>`;

const tmp = path.join(os.tmpdir(), `apex-memo-${process.pid}.html`);
fs.writeFileSync(tmp, page);
const browser = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
if (!browser) throw new Error('Не найден Chrome или Edge — укажите путь в переменной CHROME');
execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${out}`, pathToFileURL(tmp).href], { stdio: 'ignore' });
fs.rmSync(tmp, { force: true });
console.log(`PDF: ${out} (${Math.round(fs.statSync(out).size / 1024)} КБ)`);
