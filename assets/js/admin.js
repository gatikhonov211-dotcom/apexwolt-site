/* Кабинет менеджера: заявки партнёров (одобрить с коэффициентом / отклонить / изменить коэффициент)
   и загрузка закупочной стоимости из Excel. Excel разбирается в браузере (SheetJS, assets/vendor),
   на сервер уходит только {артикул: цена}. Права проверяет сервер. */
(function () {
  const auth = window.ApexAuth;
  const { esc, money, plural } = window.ApexUI;
  const { products } = window.APEX_DATA;
  const skus = new Set(products.map(p => p.sku));
  const list = document.getElementById('adm-list');
  const STATUS = { pending: 'На проверке', approved: 'Одобрена', rejected: 'Отклонена' };
  let regs = [];
  let filter = 'pending';

  if (!auth.isManager) { location.replace('login.html'); return; }
  document.getElementById('adm-who').textContent = auth.user.email;
  document.getElementById('adm-logout').addEventListener('click', () => auth.logout());

  const when = iso => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const coef = v => v == null ? '' : String(v).replace('.', ',');

  const fail = err => {
    if (err.status === 401 || err.status === 403) { location.replace('login.html'); return true; }
    return false;
  };

  /* ---------- заявки ---------- */
  function renderList() {
    const shown = filter === 'all' ? regs : regs.filter(r => r.status === filter);
    const counts = regs.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
    document.querySelectorAll('[data-filter]').forEach(b => {
      const n = b.dataset.filter === 'all' ? regs.length : counts[b.dataset.filter] || 0;
      b.textContent = `${b.textContent.replace(/\s·\s\d+$/, '')} · ${n}`;
    });
    if (!shown.length) {
      list.innerHTML = `<div class="empty empty-wide"><b>${filter === 'pending' ? 'Новых заявок нет' : 'Здесь пока пусто'}</b><span>Новые заявки со страницы «Стать партнёром» появятся здесь и придут на почту.</span></div>`;
      return;
    }
    list.innerHTML = shown.map(r => `
      <article class="admin-reg" data-inn="${esc(r.company.inn)}">
        <div class="admin-reg-main">
          <p class="admin-reg-top"><span class="admin-status is-${esc(r.status)}">${STATUS[r.status] || esc(r.status)}</span><span>${esc(r.id)} · ${when(r.createdAt)}</span></p>
          <h3>${esc(r.company.name)}</h3>
          <p class="admin-reg-meta">ИНН ${esc(r.company.inn)}${r.company.kpp ? ` · КПП ${esc(r.company.kpp)}` : ''}${r.company.ogrn ? ` · ОГРН ${esc(r.company.ogrn)}` : ''}</p>
          ${r.company.address ? `<p class="admin-reg-meta">${esc(r.company.address)}</p>` : ''}
          <p class="admin-reg-contact"><b>${esc(r.contact.name)}</b>${r.contact.position ? `, ${esc(r.contact.position)}` : ''} · <a class="link" href="mailto:${esc(r.contact.email)}">${esc(r.contact.email)}</a> · <a class="link" href="tel:${esc(r.contact.phone.replace(/[^\d+]/g, ''))}">${esc(r.contact.phone)}</a></p>
          ${r.comment ? `<p class="admin-reg-comment">${esc(r.comment)}</p>` : ''}
          ${r.decidedBy ? `<p class="admin-reg-meta">Решение: ${esc(r.decidedBy)}, ${when(r.decidedAt)}</p>` : ''}
        </div>
        <form class="admin-reg-actions" novalidate>
          <label class="field"><span class="admin-label">Коэффициент</span>
            <input name="coefficient" inputmode="decimal" placeholder="например 1,15" value="${esc(coef(r.coefficient))}" aria-label="Коэффициент для ${esc(r.company.name)}"></label>
          ${r.status === 'approved'
            ? '<button type="submit" class="button button-dark" data-action="update">Сохранить</button><button type="button" class="button button-ghost" data-action="reject">Закрыть доступ</button>'
            : `<button type="submit" class="button button-dark" data-action="approve">Одобрить</button>${r.status === 'pending' ? '<button type="button" class="button button-ghost" data-action="reject">Отклонить</button>' : ''}`}
          <p class="form-msg" role="status"></p>
        </form>
      </article>`).join('');
  }

  async function loadList() {
    try {
      regs = (await auth.api('/api/admin/registrations')).registrations;
      renderList();
    } catch (err) {
      if (fail(err)) return;
      list.innerHTML = `<div class="empty empty-wide"><b>Не удалось загрузить заявки</b><span>${esc(err.message)}</span><button type="button" class="button button-dark" id="adm-retry">Повторить</button></div>`;
      document.getElementById('adm-retry').addEventListener('click', loadList);
    }
  }

  document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', x === b); });
    renderList();
  }));

  async function act(form, action) {
    const card = form.closest('[data-inn]');
    const msg = form.querySelector('.form-msg');
    const reg = regs.find(r => r.company.inn === card.dataset.inn);
    const coefficient = form.elements.coefficient.value.trim();
    if (action !== 'reject') {
      const k = Number(coefficient.replace(',', '.'));
      if (!(k >= 0.5 && k <= 5)) { msg.textContent = 'Коэффициент — число от 0,5 до 5, например 1,15'; msg.className = 'form-msg is-error'; form.elements.coefficient.focus(); return; }
    } else if (!confirm(reg.status === 'approved' ? `Закрыть доступ «${reg.company.name}»? Партнёр перестанет видеть свои цены.` : `Отклонить заявку «${reg.company.name}»?`)) return;
    form.querySelectorAll('button, input').forEach(x => { x.disabled = true; });
    msg.textContent = 'Сохраняем…'; msg.className = 'form-msg is-info';
    try {
      const json = await auth.api(`/api/admin/registrations/${reg.company.inn}`, { method: 'POST', body: { action, coefficient } });
      Object.assign(reg, json.registration);
      renderList();
      window.ApexUI.toast(action === 'approve' ? 'Заявка одобрена — партнёру ушло письмо с доступом' : action === 'update' ? 'Коэффициент сохранён' : 'Доступ закрыт');
    } catch (err) {
      if (fail(err)) return;
      form.querySelectorAll('button, input').forEach(x => { x.disabled = false; });
      msg.textContent = err.message; msg.className = 'form-msg is-error';
    }
  }

  list.addEventListener('submit', e => { e.preventDefault(); act(e.target, e.submitter?.dataset.action || e.target.querySelector('[type=submit]').dataset.action); });
  list.addEventListener('click', e => { const b = e.target.closest('button[type=button][data-action]'); if (b) act(b.form, b.dataset.action); });

  /* ---------- заявки на товары ---------- */
  const ordList = document.getElementById('adm-orders');
  const OSTATUS = { new: 'Новая', work: 'В работе', done: 'Закрыта' };
  let orders = [];
  let ofilter = 'new';

  function renderOrders() {
    const shown = ofilter === 'all' ? orders : orders.filter(o => o.status === ofilter);
    document.querySelectorAll('[data-ofilter]').forEach(b => {
      const n = b.dataset.ofilter === 'all' ? orders.length : orders.filter(o => o.status === b.dataset.ofilter).length;
      b.textContent = `${b.textContent.replace(/\s·\s\d+$/, '')} · ${n}`;
    });
    if (!shown.length) {
      ordList.innerHTML = `<div class="empty empty-wide"><b>${ofilter === 'new' ? 'Новых заявок нет' : 'Здесь пока пусто'}</b><span>Заявки из корзины сайта появятся здесь и придут на почту.</span></div>`;
      return;
    }
    ordList.innerHTML = shown.map(o => `
      <article class="admin-reg admin-order" data-order="${esc(o.id)}">
        <div class="admin-reg-main">
          <p class="admin-reg-top"><span class="admin-status is-${o.status === 'new' ? 'pending' : o.status === 'work' ? 'approved' : 'rejected'}">${OSTATUS[o.status] || esc(o.status)}</span><span>${esc(o.id)} · ${when(o.createdAt)}${o.partner ? ' · партнёр' : ' · гость'}</span></p>
          <h3>${esc(o.company.name)} <span class="admin-order-sum">${money(o.total)}</span></h3>
          <p class="admin-reg-meta">ИНН ${esc(o.company.inn)}${o.partner && o.coefficient ? ` · коэффициент ${coef(o.coefficient)}` : ''}</p>
          <p class="admin-reg-contact"><b>${esc(o.contact.name)}</b> · <a class="link" href="mailto:${esc(o.contact.email)}">${esc(o.contact.email)}</a> · <a class="link" href="tel:${esc(o.contact.phone.replace(/[^\d+]/g, ''))}">${esc(o.contact.phone)}</a></p>
          ${o.comment ? `<p class="admin-reg-comment">${esc(o.comment)}</p>` : ''}
          <ul class="admin-order-items">${o.items.map(it => {
            const price = it.partnerPrice ?? it.retail;
            return `<li><span>${esc(it.title || it.sku)} <small>арт. ${esc(it.sku)}</small></span><span>${it.qty} шт. × ${price ? money(price) : 'по запросу'}${it.partnerPrice != null ? ' <small>партнёр</small>' : it.retail ? ` <small>${esc(it.retailKind || 'РРЦ')}</small>` : ''}</span></li>`;
          }).join('')}</ul>
          ${o.statusBy ? `<p class="admin-reg-meta">Статус: ${esc(o.statusBy)}, ${when(o.statusAt)}</p>` : ''}
        </div>
        <div class="admin-reg-actions">
          ${Object.keys(OSTATUS).filter(k => k !== o.status).map(k => `<button type="button" class="button ${k === 'work' ? 'button-dark' : 'button-ghost'}" data-ostatus="${k}">${k === 'new' ? 'Вернуть в новые' : k === 'work' ? 'Взять в работу' : 'Закрыть'}</button>`).join('')}
          <p class="form-msg" role="status"></p>
        </div>
      </article>`).join('');
  }

  async function loadOrders() {
    try {
      orders = (await auth.api('/api/admin/orders')).orders;
      renderOrders();
    } catch (err) {
      if (fail(err)) return;
      ordList.innerHTML = `<div class="empty empty-wide"><b>Не удалось загрузить заявки</b><span>${esc(err.message)}</span><button type="button" class="button button-dark" id="adm-oretry">Повторить</button></div>`;
      document.getElementById('adm-oretry').addEventListener('click', loadOrders);
    }
  }

  document.querySelectorAll('[data-ofilter]').forEach(b => b.addEventListener('click', () => {
    ofilter = b.dataset.ofilter;
    document.querySelectorAll('[data-ofilter]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', x === b); });
    renderOrders();
  }));

  ordList.addEventListener('click', async e => {
    const b = e.target.closest('[data-ostatus]');
    if (!b) return;
    const card = b.closest('[data-order]');
    const msg = card.querySelector('.form-msg');
    card.querySelectorAll('button').forEach(x => { x.disabled = true; });
    try {
      const json = await auth.api(`/api/admin/orders/${card.dataset.order}`, { method: 'POST', body: { status: b.dataset.ostatus } });
      Object.assign(orders.find(o => o.id === json.order.id), json.order);
      renderOrders();
      window.ApexUI.toast(`Заявка ${json.order.id}: ${OSTATUS[json.order.status].toLowerCase()}`);
    } catch (err) {
      if (fail(err)) return;
      card.querySelectorAll('button').forEach(x => { x.disabled = false; });
      msg.textContent = err.message; msg.className = 'form-msg is-error';
    }
  });

  /* ---------- закупочная стоимость ---------- */
  const meta = document.getElementById('adm-cost-meta');
  const fileInput = document.getElementById('adm-file');
  const colWrap = document.getElementById('adm-col-wrap');
  const colSelect = document.getElementById('adm-col');
  const costMsg = document.getElementById('adm-cost-msg');
  const upload = document.getElementById('adm-upload');
  let table = null; // { headers, rows: [{артикул, значения…}] }

  const sayCost = (text, kind = 'info') => { costMsg.textContent = text; costMsg.className = `form-msg is-${kind}`; };

  async function loadMeta() {
    try {
      const m = await auth.api('/api/admin/costs');
      meta.innerHTML = m.count
        ? `Загружено <b>${m.count}</b> ${plural(m.count, 'позиция', 'позиции', 'позиций')} · ${when(m.updatedAt)}${m.source ? ` · ${esc(m.source)}` : ''}${m.updatedBy ? ` · ${esc(m.updatedBy)}` : ''}`
        : 'Закупочная стоимость ещё не загружена — партнёры видят только МРЦ/РРЦ.';
    } catch (err) { if (!fail(err)) meta.textContent = `Не удалось получить сведения: ${err.message}`; }
  }

  const num = v => {
    if (typeof v === 'number') return v;
    const n = Number(String(v ?? '').replace(/\s|₽/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  // Все листы книги: строка заголовков — первая, где есть «Артикул»; строки-группы без артикула пропускаются.
  function readBook(wb) {
    const headers = new Set();
    const rows = [];
    for (const name of wb.SheetNames) {
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      const h = grid.findIndex(r => r.some(c => /^артикул$/i.test(String(c).trim())));
      if (h < 0) continue;
      const head = grid[h].map(c => String(c).trim());
      const skuCol = head.findIndex(c => /^артикул$/i.test(c));
      head.forEach((c, i) => { if (c && i !== skuCol) headers.add(c); });
      for (const r of grid.slice(h + 1)) {
        const sku = String(r[skuCol] ?? '').trim();
        if (!sku) continue;
        const row = { sku };
        head.forEach((c, i) => { if (c && i !== skuCol) row[c] = r[i]; });
        rows.push(row);
      }
    }
    return { headers: [...headers], rows };
  }

  function preview() {
    const col = colSelect.value;
    const costs = {};
    for (const r of table.rows) { const n = num(r[col]); if (n > 0) costs[r.sku] = n; }
    const count = Object.keys(costs).length;
    const known = Object.keys(costs).filter(s => skus.has(s)).length;
    const example = products.find(p => costs[p.sku]);
    upload.disabled = !count;
    sayCost(count
      ? `Найдено ${count} ${plural(count, 'цена', 'цены', 'цен')}, с артикулами каталога совпадает ${known}.${example ? ` Пример: ${example.sku} — ${money(costs[example.sku])}.` : ''}`
      : 'В этой колонке нет чисел — выберите другую.', count ? 'info' : 'error');
    return costs;
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    table = null; upload.disabled = true; colWrap.hidden = true;
    if (!file) { sayCost(''); return; }
    sayCost('Читаем файл…');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      table = readBook(wb);
      if (!table.rows.length) { sayCost('Не нашли колонку «Артикул» ни на одном листе', 'error'); return; }
      const numeric = table.headers.filter(h => table.rows.some(r => num(r[h]) > 0));
      colSelect.innerHTML = numeric.map(h => `<option>${esc(h)}</option>`).join('');
      const guess = numeric.find(h => /себестоим|закуп|дистриб/i.test(h));
      if (guess) colSelect.value = guess;
      colWrap.hidden = false;
      preview();
    } catch { sayCost('Не удалось прочитать файл — сохраните его как .xlsx и попробуйте снова', 'error'); }
  });

  colSelect.addEventListener('change', preview);

  upload.addEventListener('click', async () => {
    const costs = preview();
    upload.disabled = true;
    sayCost('Загружаем…');
    try {
      const json = await auth.api('/api/admin/costs', { method: 'PUT', body: { costs, source: `${fileInput.files[0].name} · ${colSelect.value}` } });
      sayCost(`Готово: ${json.count} ${plural(json.count, 'позиция', 'позиции', 'позиций')}. Партнёры увидят новые цены в течение 10 минут или после повторного входа.`, 'ok');
      fileInput.value = ''; colWrap.hidden = true; table = null;
      loadMeta();
    } catch (err) {
      if (fail(err)) return;
      sayCost(err.message, 'error');
      upload.disabled = false;
    }
  });

  loadOrders();
  loadList();
  loadMeta();
})();
