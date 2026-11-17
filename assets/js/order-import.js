/* Импорт заявки: обработка файла выполняется в браузере. */
(function () {
  const clean = value => String(value ?? '').normalize('NFKC').trim();
  const header = value => clean(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');
  const aliases = {
    sku: ['артикул', 'артикултовара', 'sku', 'article'],
    barcode: ['шк', 'штрихкод', 'штрихкодтовара', 'баркод', 'баркодтовара', 'barcode', 'ean', 'ean13', 'gtin'],
    qty: ['количество', 'колво', 'количествотовара', 'количествотоваров', 'количествошт', 'колвошт', 'qty', 'quantity']
  };

  function parseRows(rows, find) {
    let columns, start;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const names = rows[i].map(header);
      const c = Object.fromEntries(Object.entries(aliases).map(([key, labels]) => [key, names.findIndex(n => labels.includes(n))]));
      if (c.qty >= 0 && (c.sku >= 0 || c.barcode >= 0)) { columns = c; start = i; break; }
    }
    if (!columns) throw new Error('Нужны заголовки «Артикул» или «ШК» и «Количество». Проверьте первую строку таблицы.');
    const lines = [];
    for (let i = start + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row.some(v => clean(v))) continue;
      if (lines.length >= 5000) throw new Error('В файле больше 5000 строк. Разделите заявку на несколько файлов.');
      const sku = columns.sku >= 0 ? clean(row[columns.sku]) : '';
      const barcode = columns.barcode >= 0 ? clean(row[columns.barcode]) : '';
      const code = sku || barcode;
      const q = clean(row[columns.qty]).replace(/\s/g, '').replace(',', '.');
      const qty = q ? Number(q) : NaN;
      const line = { row: i + 1, code, qty };
      if (!code) line.error = 'Не указан артикул или ШК.';
      else if (!Number.isInteger(qty) || qty < 1 || qty > 9999) line.error = 'Количество должно быть целым числом от 1 до 9999.';
      else {
        let matches = find(code);
        if (sku && barcode) {
          const byBarcode = find(barcode);
          matches = matches.filter(p => byBarcode.some(b => b.id === p.id));
        }
        if (!matches.length) line.error = sku && barcode ? 'Артикул и ШК не совпадают или товар не найден.' : 'Товар не найден.';
        else if (matches.length > 1) line.error = 'Неоднозначный код. Укажите точный артикул.';
        else line.product = matches[0];
      }
      lines.push(line);
    }
    if (!lines.length) throw new Error('В таблице есть заголовки, но нет товаров.');
    return lines;
  }

  function plan(lines, qtyOf) {
    const groups = new Map(), errors = lines.filter(l => l.error).map(l => ({ ...l }));
    for (const l of lines.filter(l => l.product)) {
      const g = groups.get(l.product.id) || { id: l.product.id, product: l.product, qty: 0, rows: [] };
      g.qty += l.qty; g.rows.push(l.row); groups.set(g.id, g);
    }
    const items = [];
    for (const g of groups.values()) {
      if (qtyOf(g.id) + g.qty > 9999) errors.push({ row: g.rows.join(', '), code: g.product.sku, error: 'С учётом корзины больше 9999 шт. Уменьшите количество.' });
      else items.push(g);
    }
    return { items, errors };
  }
  window.ApexOrderImport = { parseRows, plan };
  if (typeof document === 'undefined') return;

  const store = window.ApexStore, esc = window.ApexUI.esc;
  let state = null, serial = 0, library;
  function loadLibrary() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/xlsx.full.min.js';
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('Не удалось прочитать Excel.'));
      script.onerror = () => { library = null; script.remove(); reject(new Error('Не удалось загрузить обработчик Excel. Выберите файл ещё раз.')); };
      document.head.append(script);
    });
    return library;
  }
  function render() {
    const box = document.querySelector('[data-import-preview]');
    if (!box || !state) return;
    if (state.message) { box.innerHTML = `<p role="status">${esc(state.message)}</p>`; return; }
    const { items, errors } = plan(state.lines, store.qty);
    box.innerHTML = `<p role="status"><b>${esc(state.name)}</b> · лист «${esc(state.sheet)}»<br>Позиций к добавлению: ${items.length}, ${items.reduce((s, p) => s + p.qty, 0)} шт. Ошибок: ${errors.length}.</p>
      ${items.length ? `<details><summary>Проверить товары</summary><ul class="import-lines">${items.slice(0, 100).map(p => `<li>${esc(p.product.title)}<br><small>${esc(p.product.sku)} · +${p.qty} шт.</small></li>`).join('')}</ul>${items.length > 100 ? '<p>Показаны первые 100 позиций.</p>' : ''}</details>` : ''}
      ${errors.length ? `<details open><summary>Строки, которые не будут добавлены</summary><ul class="import-lines">${errors.slice(0, 100).map(l => `<li>Строка ${esc(l.row)}${l.code ? ` · ${esc(l.code)}` : ''}: ${esc(l.error)}</li>`).join('')}</ul>${errors.length > 100 ? '<p>Показаны первые 100 ошибок.</p>' : ''}</details>` : ''}
      ${items.length ? `<button type="button" class="button button-dark button-wide" data-import-apply>${errors.length ? 'Добавить только найденные товары' : 'Добавить в заявку'}</button>` : '<p>Исправьте файл и выберите его повторно.</p>'}`;
  }
  document.addEventListener('change', async e => {
    if (!e.target.matches('[data-order-file]')) return;
    const file = e.target.files[0]; if (!file) return;
    const token = ++serial; e.target.value = '';
    state = { message: 'Читаем файл…' }; render();
    try {
      if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Выберите файл Excel .xlsx или .xls.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ. Удалите лишние листы или разделите файл.');
      const XLSX = await loadLibrary();
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: 5032 });
      let selected;
      for (const name of book.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: '', blankrows: true });
        try { selected = { lines: parseRows(rows, store.findByCode), sheet: name, name: file.name }; break; }
        catch (err) { if (!err.message.startsWith('Нужны заголовки')) throw err; }
      }
      if (!selected) throw new Error('На листах не найдены колонки «Артикул» или «ШК» и «Количество».');
      if (token !== serial) return;
      state = selected;
    } catch (err) { if (token === serial) state = { message: err.message || 'Не удалось прочитать файл. Проверьте, что он не повреждён и не защищён паролем.' }; }
    render();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-import-apply]') || !state?.lines) return;
    const { items, errors } = plan(state.lines, store.qty);
    if (!items.length) { render(); return; }
    const fields = [...document.querySelectorAll('#request-form input, #request-form textarea')];
    const draft = Object.fromEntries(fields.map(el => [el.name, el.type === 'checkbox' ? el.checked : el.value]));
    state = { message: `Добавлено позиций: ${items.length}, ${items.reduce((s, p) => s + p.qty, 0)} шт.${errors.length ? ` Пропущено строк с ошибками: ${errors.length}.` : ''}` };
    store.addRequestRows(items);
    for (const el of document.querySelectorAll('#request-form input, #request-form textarea')) if (Object.hasOwn(draft, el.name)) {
      if (el.type === 'checkbox') el.checked = draft[el.name]; else el.value = draft[el.name];
    }
    render();
    document.querySelector('[data-import-preview]')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });
  store.onChange(render);
  // Панель пересоздаётся при открытии заявки; возвращаем результаты проверки файла.
  new MutationObserver(() => {
    const box = document.querySelector('[data-import-preview]');
    if (box && !box.childNodes.length && state) render();
  }).observe(document.getElementById('drawer'), { childList: true, subtree: true });
})();
