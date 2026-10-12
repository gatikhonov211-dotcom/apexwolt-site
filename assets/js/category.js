/* Страница категории для любого направления, категории, бренда или поиска.
   ?section=…  — направление целиком, вкладки по его категориям
   ?category=… — одна категория (вкладка внутри своего направления)
   ?brand=… / ?q=… — по всему каталогу
   Фильтры «Выбор по параметрам» строятся из характеристик товаров в текущей выборке. */
(function () {
  const { sections, categories, products, novelties } = window.APEX_DATA;
  const { esc, money, plural, productCard, findProducts, specPair } = window.ApexUI;
  const PAGE_SIZE = 12;
  const el = id => document.getElementById(id);
  const list = el('products');
  const params = new URLSearchParams(location.search);

  /* ---------- область каталога ---------- */
  let section = sections.find(s => s.key === params.get('section'));
  const catParam = categories[params.get('category')] ? params.get('category') : null;
  if (!section && catParam) section = sections.find(s => s.key === categories[catParam].section);
  const scopePool = section ? products.filter(p => section.categories.includes(p.category)) : products;
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();

  /* ---------- фасеты из характеристик ---------- */
  const specMap = new Map(products.map(p => [p.id, new Map(p.specs.map(specPair).filter(([k, v]) => k && v))]));
  const buildFacets = pool => {
    if (pool.length < 3) return [];
    const stats = new Map();
    pool.forEach(p => specMap.get(p.id).forEach((v, k) => {
      if (!stats.has(k)) stats.set(k, new Map());
      const m = stats.get(k);
      m.set(v, (m.get(v) || 0) + 1);
    }));
    return [...stats.entries()]
      .map(([key, values]) => ({ key, values, covered: [...values.values()].reduce((a, b) => a + b, 0) }))
      .filter(f => f.covered >= pool.length * 0.4 && f.values.size >= 2 && f.values.size <= 8 && [...f.values.keys()].every(v => v.length <= 36))
      .sort((a, b) => b.covered - a.covered)
      .slice(0, 6)
      .map(f => ({ key: f.key, values: [...f.values.keys()].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })) }));
  };

  /* ---------- состояние в URL ---------- */
  const state = {
    category: catParam,
    q: params.get('q') || '',
    brands: (params.get('brand') || '').split(',').filter(b => brands.includes(b)),
    stockOnly: params.get('stock') === '1',
    priceMax: Number(params.get('price')) || null,
    facets: {},
    sort: ['stock', 'new', 'price-asc', 'price-desc', 'name'].includes(params.get('sort')) ? params.get('sort') : 'stock',
    view: params.get('view') === 'list' ? 'list' : 'grid',
    page: Math.max(1, Number(params.get('page')) || 1),
    shown: 1
  };
  params.forEach((v, k) => { if (k.startsWith('f.')) state.facets[k.slice(2)] = v.split('|').filter(Boolean); });
  try { if (!params.has('view') && localStorage.getItem('apx-view') === 'list') state.view = 'list'; } catch { /* нет хранилища */ }

  const syncUrl = () => {
    const p = new URLSearchParams();
    if (section && !state.category) p.set('section', section.key);
    if (state.category) p.set('category', state.category);
    if (state.q) p.set('q', state.q);
    if (state.brands.length) p.set('brand', state.brands.join(','));
    if (state.stockOnly) p.set('stock', '1');
    if (state.priceMax) p.set('price', state.priceMax);
    Object.entries(state.facets).forEach(([k, v]) => { if (v.length) p.set(`f.${k}`, v.join('|')); });
    if (state.sort !== 'stock') p.set('sort', state.sort);
    if (state.view === 'list') p.set('view', 'list');
    if (state.page > 1) p.set('page', state.page);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  };

  /* ---------- выборки ---------- */
  // Пул до параметрических фильтров: область + вкладка категории + поиск.
  const basePool = () => {
    let pool = state.category ? scopePool.filter(p => p.category === state.category) : scopePool;
    if (state.q) pool = findProducts(state.q, pool);
    return pool;
  };
  let facets = [];
  let priceBounds = [0, 0];
  const recomputeFacets = () => {
    const pool = basePool();
    facets = buildFacets(pool);
    Object.keys(state.facets).forEach(k => { if (!facets.some(f => f.key === k)) delete state.facets[k]; });
    const prices = pool.map(p => p.price).filter(Boolean);
    priceBounds = prices.length ? [Math.min(...prices), Math.max(...prices)] : [0, 0];
    if (state.priceMax && (state.priceMax >= priceBounds[1] || state.priceMax < priceBounds[0])) state.priceMax = null;
  };
  const matchParams = (p, skipCategory) => {
    if (!skipCategory && state.category && p.category !== state.category) return false;
    if (state.brands.length && !state.brands.includes(p.brand)) return false;
    if (state.stockOnly && !p.stock) return false;
    if (state.priceMax && (!p.price || p.price > state.priceMax)) return false;
    const m = specMap.get(p.id);
    return Object.entries(state.facets).every(([k, vals]) => !vals.length || vals.includes(m.get(k)));
  };
  const newSet = new Set(novelties);
  const filtered = () => {
    const sorters = {
      stock: (a, b) => (b.stock - a.stock) || (!!b.image - !!a.image) || a.name.localeCompare(b.name, 'ru'),
      new: (a, b) => (newSet.has(b.id) - newSet.has(a.id)) || (b.stock - a.stock),
      'price-asc': (a, b) => (a.price || Infinity) - (b.price || Infinity),
      'price-desc': (a, b) => b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name, 'ru')
    };
    return basePool().filter(p => matchParams(p)).sort(sorters[state.sort]);
  };
  const activeCount = () => state.brands.length + (state.stockOnly ? 1 : 0) + (state.priceMax ? 1 : 0)
    + Object.values(state.facets).reduce((s, v) => s + v.length, 0);

  /* ---------- заголовок и хлебные крошки ---------- */
  const renderHead = () => {
    const cat = state.category && categories[state.category];
    const title = cat ? cat.title : section ? section.title : state.q ? 'Результаты поиска' : state.brands.length === 1 ? `Бренд ${state.brands[0]}` : 'Весь каталог';
    el('category-title').textContent = title;
    document.title = `${title} — каталог APEXWOLT для партнёров`;
    el('category-lead').textContent = section ? section.description
      : 'Все направления APEXWOLT, VOLTEXA, SUMO, PROPEL и APEX–КРЕП.';
    const crumbs = [['index.html', 'Главная'], ['catalog.html', 'Каталог']];
    if (section) crumbs.push([cat ? `category.html?section=${section.key}` : '', section.title]);
    if (cat) crumbs.push(['', cat.title]);
    if (!section) crumbs.push(['', title]);
    el('breadcrumbs').innerHTML = crumbs.map(([h, t], i) => i === crumbs.length - 1
      ? `<span aria-current="page">${esc(t)}</span>`
      : `<a href="${h}">${esc(t)}</a><span aria-hidden="true">/</span>`).join('');
  };

  /* ---------- вкладки категорий ---------- */
  const renderSubcats = () => {
    const box = el('subcats');
    if (!section || section.categories.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    let pool = scopePool.filter(p => matchParams(p, true));
    if (state.q) pool = findProducts(state.q, pool);
    const tabs = [[null, 'Все'], ...section.categories.map(c => [c, categories[c].title])];
    box.innerHTML = tabs.map(([key, title]) => {
      const n = key ? pool.filter(p => p.category === key).length : pool.length;
      const on = state.category === key;
      return `<button type="button" role="tab" class="chip${on ? ' is-on' : ''}" aria-selected="${on}" data-sub="${key || ''}">${esc(title)}<i>${n}</i></button>`;
    }).join('');
  };
  el('subcats').addEventListener('click', e => {
    const b = e.target.closest('[data-sub]');
    if (!b) return;
    state.category = b.dataset.sub || null;
    state.page = 1; state.shown = 1;
    recomputeFacets(); renderPanel(); update();
    el('subcats').querySelector(`[data-sub="${b.dataset.sub}"]`).focus();
  });
  el('subcats').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = [...el('subcats').querySelectorAll('[data-sub]')];
    const i = tabs.indexOf(document.activeElement);
    tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].click();
  });

  /* ---------- панель фильтров ---------- */
  const panel = el('filter-panel');
  const toggle = el('filter-toggle');
  const fmtPrice = v => `до ${money(v)}`;
  const renderPanel = () => {
    const pool = basePool();
    const poolBrands = brands.filter(b => pool.some(p => p.brand === b) || state.brands.includes(b));
    panel.innerHTML = `
      ${poolBrands.length > 1 ? `<fieldset class="fgroup"><legend class="fgroup-title">Бренд</legend>
        ${poolBrands.map(b => `<label class="check"><input type="checkbox" name="brand" value="${esc(b)}"${state.brands.includes(b) ? ' checked' : ''}><span>${esc(b)}</span></label>`).join('')}
      </fieldset>` : ''}
      <fieldset class="fgroup"><legend class="fgroup-title">Наличие</legend>
        <label class="check"><input type="checkbox" name="stock"${state.stockOnly ? ' checked' : ''}><span>Только в наличии</span></label>
      </fieldset>
      ${priceBounds[1] > priceBounds[0] ? `<div class="fgroup">
        <p class="fgroup-title">МРЦ</p>
        <input type="range" name="price" min="${priceBounds[0]}" max="${priceBounds[1]}" step="${priceBounds[1] > 20000 ? 500 : 50}" value="${state.priceMax || priceBounds[1]}" aria-label="Максимальная МРЦ">
        <p class="range-value"><output data-for="price">${fmtPrice(state.priceMax || priceBounds[1])}</output></p>
      </div>` : ''}
      ${facets.map((f, i) => `<fieldset class="fgroup"><legend class="fgroup-title">${esc(f.key)}</legend>
        ${f.values.map(v => `<label class="check"><input type="checkbox" name="f${i}" value="${esc(v)}"${(state.facets[f.key] || []).includes(v) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}
      </fieldset>`).join('')}
      <div class="fpanel-foot">
        <button type="button" class="button button-ghost" data-reset>Сбросить</button>
        <button type="submit" class="button button-dark" data-apply></button>
      </div>`;
    updateApply();
  };
  const readPanel = () => {
    const fd = new FormData(panel);
    state.brands = fd.getAll('brand');
    state.stockOnly = fd.has('stock');
    const price = Number(fd.get('price'));
    state.priceMax = price && price < priceBounds[1] ? price : null;
    state.facets = {};
    facets.forEach((f, i) => { const v = fd.getAll(`f${i}`); if (v.length) state.facets[f.key] = v; });
    state.page = 1; state.shown = 1;
  };
  const updateApply = () => {
    const btn = panel.querySelector('[data-apply]');
    if (!btn) return;
    const n = filtered().length;
    btn.textContent = n ? `Показать ${n} ${plural(n, 'товар', 'товара', 'товаров')}` : 'Нет подходящих товаров';
    btn.disabled = !n;
  };
  const setPanel = open => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open);
    if (open) { const first = panel.querySelector('input'); if (first) first.focus(); }
  };
  toggle.addEventListener('click', () => setPanel(panel.hidden));
  panel.addEventListener('input', e => {
    if (e.target.name === 'price') panel.querySelector('output[data-for="price"]').textContent = fmtPrice(Number(e.target.value));
    readPanel();
    update();
  });
  panel.addEventListener('submit', e => { e.preventDefault(); setPanel(false); list.focus({ preventScroll: true }); });
  panel.addEventListener('click', e => { if (e.target.closest('[data-reset]')) resetFilters(); });
  const resetFilters = () => {
    Object.assign(state, { brands: [], stockOnly: false, priceMax: null, facets: {}, page: 1, shown: 1 });
    recomputeFacets(); renderPanel(); update();
  };

  /* ---------- активные фильтры ---------- */
  const SEP = '\u0001';
  const renderActive = () => {
    const chips = [];
    if (state.q) chips.push(['q', `Поиск: «${state.q}»`]);
    state.brands.forEach(b => chips.push([`brand${SEP}${b}`, b]));
    if (state.stockOnly) chips.push(['stock', 'В наличии']);
    if (state.priceMax) chips.push(['price', `МРЦ ${fmtPrice(state.priceMax)}`]);
    Object.entries(state.facets).forEach(([k, vals]) => vals.forEach(v => chips.push([`f${SEP}${k}${SEP}${v}`, `${k}: ${v}`])));
    el('active-filters').innerHTML = chips.map(([k, t]) => `<button type="button" class="tag" data-remove="${esc(k)}" aria-label="Убрать фильтр: ${esc(t)}">${esc(t)}<span aria-hidden="true">×</span></button>`).join('')
      + (chips.length > 1 ? '<button type="button" class="link muted" data-remove="all">Сбросить всё</button>' : '');
    const n = activeCount();
    el('filter-count').textContent = n;
    el('filter-count').hidden = !n;
  };
  el('active-filters').addEventListener('click', e => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    const [k, a, v] = b.dataset.remove.split(SEP);
    if (k === 'all' || k === 'q') { state.q = ''; document.getElementById('search-input').value = ''; }
    if (k === 'all') { resetFilters(); return; }
    if (k === 'brand') state.brands = state.brands.filter(x => x !== a);
    if (k === 'stock') state.stockOnly = false;
    if (k === 'price') state.priceMax = null;
    if (k === 'f') state.facets[a] = (state.facets[a] || []).filter(x => x !== v);
    state.page = 1; state.shown = 1;
    recomputeFacets(); renderPanel(); update();
  });

  /* ---------- сортировка, вид, поиск ---------- */
  const sortSelect = el('sort');
  sortSelect.value = state.sort;
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; state.page = 1; state.shown = 1; update(); });
  const viewButtons = document.querySelectorAll('[data-view]');
  viewButtons.forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    try { localStorage.setItem('apx-view', state.view); } catch { /* нет хранилища */ }
    update();
  }));
  window.addEventListener('apex:search', e => {
    state.q = e.detail; state.category = null; state.page = 1; state.shown = 1;
    recomputeFacets(); renderPanel(); update();
    el('result-count').scrollIntoView({ behavior: window.ApexUI.reduceMotion() ? 'auto' : 'smooth', block: 'center' });
  });
  if (state.q) document.getElementById('search-input').value = state.q;

  /* ---------- список и страницы ---------- */
  list.tabIndex = -1;
  const pageButtons = (pages, from, to) => {
    const nums = new Set([1, pages, from - 1, to + 1].filter(n => n >= 1 && n <= pages));
    for (let n = from; n <= to; n++) nums.add(n);
    const sorted = [...nums].sort((a, b) => a - b);
    return sorted.map((n, i) => {
      const gap = i && n - sorted[i - 1] > 1 ? '<span class="gap" aria-hidden="true">…</span>' : '';
      const on = n >= from && n <= to;
      return `${gap}<button type="button" data-page="${n}"${on ? ' aria-current="page" class="is-on"' : ''} aria-label="Страница ${n}">${n}</button>`;
    }).join('');
  };
  const renderList = () => {
    const items = filtered();
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    if (state.page > pages) { state.page = pages; state.shown = 1; }
    const lastPage = Math.min(pages, state.page + state.shown - 1);
    const visible = items.slice((state.page - 1) * PAGE_SIZE, lastPage * PAGE_SIZE);

    el('result-count').textContent = items.length
      ? `${items.length} ${plural(items.length, 'товар', 'товара', 'товаров')}${state.q ? ` по запросу «${state.q}»` : ''}`
      : '';
    list.className = `products is-${state.view}`;
    viewButtons.forEach(b => b.setAttribute('aria-pressed', b.dataset.view === state.view));
    list.innerHTML = items.length ? visible.map(p => productCard(p)).join('') : `
      <div class="empty empty-wide">
        <p class="empty-title">${state.q && !basePool().length ? `По запросу «${esc(state.q)}» ничего нет` : 'Под эти параметры товаров нет'}</p>
        <p>Ослабьте фильтры, проверьте написание или посмотрите весь каталог — в нём ${products.length} ${plural(products.length, 'позиция', 'позиции', 'позиций')}.</p>
        <div class="empty-actions"><button type="button" class="button button-dark" data-empty-reset>Сбросить фильтры</button><a class="button button-ghost" href="catalog.html">Все направления</a></div>
      </div>`;

    const more = el('load-more');
    more.hidden = lastPage >= pages;
    more.textContent = `Показать ещё ${Math.min(items.length - lastPage * PAGE_SIZE, PAGE_SIZE)}`;
    el('pagination').innerHTML = pages > 1 ? pageButtons(pages, state.page, lastPage) : '';
  };
  list.addEventListener('click', e => {
    if (!e.target.closest('[data-empty-reset]')) return;
    state.q = '';
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
    document.querySelector('.toolbar').scrollIntoView({ behavior: window.ApexUI.reduceMotion() ? 'auto' : 'smooth' });
  });

  function update() {
    renderHead();
    renderSubcats();
    renderActive();
    renderList();
    updateApply();
    syncUrl();
  }
  recomputeFacets();
  renderPanel();
  update();
})();
