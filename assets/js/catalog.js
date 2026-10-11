/* Страница категории: подкатегории, фильтр по параметрам, сортировка, сетка/список, «Показать ещё» и страницы. */
(function () {
  const { section, subcategories, products } = window.APEX_DATA;
  const { esc, money, plural, productCard, findProducts } = window.ApexUI;
  const store = window.ApexStore;
  const PAGE_SIZE = 6;

  const el = id => document.getElementById(id);
  const list = el('products');

  const bounds = (fn) => {
    const v = products.map(fn).filter(n => n != null);
    return [Math.min(...v), Math.max(...v)];
  };
  const PRICE = bounds(p => p.price);
  const CURRENT = bounds(p => p.current[1]);
  const WEIGHT = bounds(p => p.weight);
  const PROCESSES = ['MMA', 'MIG/MAG', 'FLUX', 'TIG'];
  const FEATURES = [
    ['hotStart', 'Hot Start / Arc Force / Antistick'],
    ['synergic', 'Синергетическое управление'],
    ['twoFourT', 'Режим 2T/4T']
  ];

  /* ---------- состояние в URL ---------- */
  const params = new URLSearchParams(location.search);
  const listParam = key => (params.get(key) || '').split(',').filter(Boolean);
  const numParam = (key, fallback) => { const n = Number(params.get(key)); return params.has(key) && Number.isFinite(n) ? n : fallback; };
  const state = {
    sub: subcategories.some(s => s.key === params.get('sub')) ? params.get('sub') : 'all',
    q: params.get('q') || '',
    processes: listParam('type').filter(t => PROCESSES.includes(t)),
    features: listParam('fn').filter(f => FEATURES.some(([k]) => k === f)),
    stockOnly: params.get('stock') === '1',
    priceMax: numParam('price', PRICE[1]),
    currentMin: numParam('amp', CURRENT[0]),
    weightMax: numParam('kg', WEIGHT[1]),
    sort: params.get('sort') || 'stock',
    view: params.get('view') === 'list' ? 'list' : 'grid',
    page: Math.max(1, numParam('page', 1)),
    shown: 1 // сколько страниц раскрыто кнопкой «Показать ещё», начиная с page
  };
  try { if (!params.has('view') && localStorage.getItem('apx-weld-view') === 'list') state.view = 'list'; } catch { /* нет хранилища */ }

  const syncUrl = () => {
    const p = new URLSearchParams();
    if (state.sub !== 'all') p.set('sub', state.sub);
    if (state.q) p.set('q', state.q);
    if (state.processes.length) p.set('type', state.processes.join(','));
    if (state.features.length) p.set('fn', state.features.join(','));
    if (state.stockOnly) p.set('stock', '1');
    if (state.priceMax < PRICE[1]) p.set('price', state.priceMax);
    if (state.currentMin > CURRENT[0]) p.set('amp', state.currentMin);
    if (state.weightMax < WEIGHT[1]) p.set('kg', state.weightMax);
    if (state.sort !== 'stock') p.set('sort', state.sort);
    if (state.view === 'list') p.set('view', 'list');
    if (state.page > 1) p.set('page', state.page);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  };

  /* ---------- фильтрация ---------- */
  const matchFilters = (p, skip) => {
    if (skip !== 'sub' && state.sub !== 'all' && p.kind !== state.sub) return false;
    if (state.processes.length && !state.processes.every(t => p.processes.includes(t))) return false;
    if (state.features.length && !state.features.every(f => p[f])) return false;
    if (state.stockOnly && !p.stock) return false;
    if (p.price > state.priceMax) return false;
    if (p.current[1] < state.currentMin) return false;
    if (p.weight != null && p.weight > state.weightMax) return false;
    return true;
  };
  const base = () => (state.q ? findProducts(state.q) : products);
  const filtered = () => {
    const sorters = {
      stock: (a, b) => (b.stock - a.stock) || a.price - b.price,
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      'current-desc': (a, b) => b.current[1] - a.current[1],
      'weight-asc': (a, b) => (a.weight ?? 99) - (b.weight ?? 99),
      name: (a, b) => a.name.localeCompare(b.name, 'ru')
    };
    return base().filter(p => matchFilters(p)).sort(sorters[state.sort] || sorters.stock);
  };
  const activeCount = () => state.processes.length + state.features.length + (state.stockOnly ? 1 : 0)
    + (state.priceMax < PRICE[1] ? 1 : 0) + (state.currentMin > CURRENT[0] ? 1 : 0) + (state.weightMax < WEIGHT[1] ? 1 : 0);

  /* ---------- шапка категории и подкатегории ---------- */
  el('category-lead').textContent = section.lead;
  const renderSubcats = () => {
    const pool = base().filter(p => matchFilters(p, 'sub'));
    const chips = [{ key: 'all', title: 'Все модели' }, ...subcategories];
    el('subcats').innerHTML = chips.map(c => {
      const n = c.key === 'all' ? pool.length : pool.filter(p => p.kind === c.key).length;
      const on = state.sub === c.key;
      return `<button type="button" role="tab" class="chip${on ? ' is-on' : ''}" aria-selected="${on}" data-sub="${c.key}">${esc(c.title)}<i>${n}</i></button>`;
    }).join('');
  };
  el('subcats').addEventListener('click', e => {
    const b = e.target.closest('[data-sub]');
    if (!b) return;
    state.sub = b.dataset.sub; state.page = 1; state.shown = 1;
    update();
  });
  el('subcats').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = [...el('subcats').querySelectorAll('[data-sub]')];
    const i = tabs.indexOf(document.activeElement);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus(); next.click();
    el('subcats').querySelector(`[data-sub="${next.dataset.sub}"]`).focus();
  });

  /* ---------- панель фильтров ---------- */
  const panel = el('filter-panel');
  const toggle = el('filter-toggle');
  const range = (name, label, min, max, step, value, fmt) => `
    <div class="fgroup">
      <p class="fgroup-title">${label}</p>
      <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">
      <p class="range-value"><output data-for="${name}">${fmt(value)}</output></p>
    </div>`;
  const fmtPrice = v => `до ${money(v)}`;
  const fmtAmp = v => `от ${v} А`;
  const fmtKg = v => `до ${String(v).replace('.', ',')} кг`;

  const renderPanel = () => {
    panel.innerHTML = `
      <fieldset class="fgroup"><legend class="fgroup-title">Тип сварки</legend>
        ${PROCESSES.map(t => `<label class="check"><input type="checkbox" name="type" value="${t}"${state.processes.includes(t) ? ' checked' : ''}><span>${t}</span></label>`).join('')}
      </fieldset>
      <fieldset class="fgroup"><legend class="fgroup-title">Функции</legend>
        ${FEATURES.map(([k, t]) => `<label class="check"><input type="checkbox" name="fn" value="${k}"${state.features.includes(k) ? ' checked' : ''}><span>${t}</span></label>`).join('')}
        <label class="check"><input type="checkbox" name="stock"${state.stockOnly ? ' checked' : ''}><span>Только в наличии</span></label>
      </fieldset>
      ${range('amp', 'Максимальный сварочный ток', CURRENT[0], CURRENT[1], 10, state.currentMin, fmtAmp)}
      ${range('price', 'МРЦ', PRICE[0], PRICE[1], 100, state.priceMax, fmtPrice)}
      ${range('kg', 'Масса', WEIGHT[0], WEIGHT[1], 0.1, state.weightMax, fmtKg)}
      <div class="fpanel-foot">
        <button type="button" class="button button-ghost" data-reset>Сбросить</button>
        <button type="submit" class="button button-dark" data-apply></button>
      </div>`;
    updateApply();
  };
  const readPanel = () => {
    const fd = new FormData(panel);
    state.processes = fd.getAll('type');
    state.features = fd.getAll('fn');
    state.stockOnly = fd.has('stock');
    state.currentMin = Number(fd.get('amp'));
    state.priceMax = Number(fd.get('price'));
    state.weightMax = Number(fd.get('kg'));
    state.page = 1; state.shown = 1;
  };
  const updateApply = () => {
    const n = filtered().length;
    const btn = panel.querySelector('[data-apply]');
    btn.textContent = n ? `Показать ${n} ${plural(n, 'модель', 'модели', 'моделей')}` : 'Нет подходящих моделей';
    btn.disabled = !n;
  };
  const setPanel = open => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open);
    if (open) panel.querySelector('input').focus();
  };
  toggle.addEventListener('click', () => setPanel(panel.hidden));
  panel.addEventListener('input', e => {
    const out = panel.querySelector(`output[data-for="${e.target.name}"]`);
    if (out) out.textContent = ({ amp: fmtAmp, price: fmtPrice, kg: fmtKg })[e.target.name](Number(e.target.value));
    readPanel();
    update({ keepPanel: true });
  });
  panel.addEventListener('submit', e => { e.preventDefault(); setPanel(false); list.focus({ preventScroll: true }); });
  panel.addEventListener('click', e => {
    if (!e.target.closest('[data-reset]')) return;
    resetFilters();
  });
  const resetFilters = () => {
    Object.assign(state, { processes: [], features: [], stockOnly: false, priceMax: PRICE[1], currentMin: CURRENT[0], weightMax: WEIGHT[1], page: 1, shown: 1 });
    renderPanel();
    update();
  };

  /* ---------- активные фильтры (чипы с крестиком) ---------- */
  const renderActive = () => {
    const chips = [];
    if (state.q) chips.push(['q', `Поиск: «${state.q}»`]);
    state.processes.forEach(t => chips.push([`type:${t}`, t]));
    state.features.forEach(f => chips.push([`fn:${f}`, FEATURES.find(([k]) => k === f)[1]]));
    if (state.stockOnly) chips.push(['stock', 'В наличии']);
    if (state.currentMin > CURRENT[0]) chips.push(['amp', fmtAmp(state.currentMin)]);
    if (state.priceMax < PRICE[1]) chips.push(['price', `МРЦ ${fmtPrice(state.priceMax)}`]);
    if (state.weightMax < WEIGHT[1]) chips.push(['kg', fmtKg(state.weightMax)]);
    el('active-filters').innerHTML = chips.map(([k, t]) => `<button type="button" class="tag" data-remove="${esc(k)}" aria-label="Убрать фильтр: ${esc(t)}">${esc(t)}<span aria-hidden="true">×</span></button>`).join('')
      + (chips.length > 1 ? '<button type="button" class="link muted" data-remove="all">Сбросить всё</button>' : '');
    const n = activeCount();
    el('filter-count').textContent = n;
    el('filter-count').hidden = !n;
  };
  el('active-filters').addEventListener('click', e => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    const [k, v] = b.dataset.remove.split(':');
    if (k === 'all') { state.q = ''; document.getElementById('search-input').value = ''; resetFilters(); return; }
    if (k === 'q') { state.q = ''; document.getElementById('search-input').value = ''; }
    if (k === 'type') state.processes = state.processes.filter(t => t !== v);
    if (k === 'fn') state.features = state.features.filter(f => f !== v);
    if (k === 'stock') state.stockOnly = false;
    if (k === 'amp') state.currentMin = CURRENT[0];
    if (k === 'price') state.priceMax = PRICE[1];
    if (k === 'kg') state.weightMax = WEIGHT[1];
    state.page = 1; state.shown = 1;
    renderPanel();
    update();
  });

  /* ---------- сортировка и вид ---------- */
  const sortSelect = el('sort');
  sortSelect.value = state.sort;
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; state.page = 1; state.shown = 1; update(); });
  const viewButtons = document.querySelectorAll('[data-view]');
  viewButtons.forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    try { localStorage.setItem('apx-weld-view', state.view); } catch { /* нет хранилища */ }
    update();
  }));

  /* ---------- поиск из шапки ---------- */
  window.addEventListener('apex:search', e => {
    state.q = e.detail; state.sub = 'all'; state.page = 1; state.shown = 1;
    update();
    el('result-count').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  });
  if (state.q) document.getElementById('search-input').value = state.q;

  /* ---------- список, «Показать ещё», страницы ---------- */
  list.tabIndex = -1;
  const renderList = () => {
    const items = filtered();
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    if (state.page > pages) { state.page = pages; state.shown = 1; }
    const lastPage = Math.min(pages, state.page + state.shown - 1);
    const visible = items.slice((state.page - 1) * PAGE_SIZE, lastPage * PAGE_SIZE);

    el('result-count').textContent = items.length
      ? `${items.length} ${plural(items.length, 'модель', 'модели', 'моделей')}${state.q ? ` по запросу «${state.q}»` : ''}`
      : '';
    list.className = `products is-${state.view}`;
    viewButtons.forEach(b => b.setAttribute('aria-pressed', b.dataset.view === state.view));

    list.innerHTML = items.length ? visible.map(productCard).join('') : `
      <div class="empty empty-wide">
        <p class="empty-title">Под эти параметры моделей нет</p>
        <p>Ослабьте фильтры или сбросьте их — в линейке APEXWOLT ${products.length} ${plural(products.length, 'аппарат', 'аппарата', 'аппаратов')}.</p>
        <button type="button" class="button button-dark" data-empty-reset>Сбросить фильтры</button>
      </div>`;

    const more = el('load-more');
    more.hidden = lastPage >= pages;
    const rest = items.length - lastPage * PAGE_SIZE;
    more.textContent = `Показать ещё ${Math.min(rest, PAGE_SIZE)}`;

    el('pagination').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) => {
      const n = i + 1;
      const on = n >= state.page && n <= lastPage;
      return `<button type="button" data-page="${n}"${on ? ' aria-current="page" class="is-on"' : ''} aria-label="Страница ${n}">${n}</button>`;
    }).join('') : '';
  };
  list.addEventListener('click', e => {
    if (!e.target.closest('[data-empty-reset]')) return;
    state.q = ''; state.sub = 'all';
    document.getElementById('search-input').value = '';
    resetFilters();
  });
  el('load-more').addEventListener('click', () => {
    const before = list.children.length;
    state.shown += 1;
    update();
    const firstNew = list.children[before];
    if (firstNew) firstNew.querySelector('.card-title a').focus({ preventScroll: true });
  });
  el('pagination').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    state.page = Number(b.dataset.page); state.shown = 1;
    update();
    document.querySelector('.toolbar').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  /* ---------- общий цикл ---------- */
  function update(opts = {}) {
    renderSubcats();
    renderActive();
    renderList();
    if (!panel.hidden || opts.keepPanel) updateApply();
    syncUrl();
  }
  store.onChange(renderList);
  renderPanel();
  update();
})();
