/* Общие части страниц: шапка, нижняя навигация на mobile, панели избранного/сравнения/заявки, подписка, подвал. */
(function () {
  const MAIN_SITE = 'https://apexwolt-b2b-preview.netlify.app';
  const { products } = window.APEX_DATA;
  const store = window.ApexStore;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => `${Number(n).toLocaleString('ru-RU')} ₽`;
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };

  const icon = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    compare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V10M12 20V4M18 20v-7"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.5 3.8-5 7-5s5.8 1.5 7 5"/></svg>',
    request: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2.5"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
  };

  const sections = [
    ['akkumulyatornyy-instrument', 'Аккумуляторный инструмент'],
    ['setevoy-elektroinstrument', 'Сетевой электроинструмент'],
    ['stroitelnoe-oborudovanie', 'Строительное оборудование'],
    ['teplovoe-oborudovanie', 'Тепловое оборудование'],
    ['sadovaya-i-uborochnaya-tehnika', 'Садовая и уборочная техника'],
    ['svarochnoe-oborudovanie', 'Сварочное оборудование'],
    ['elektrogeneratory', 'Электрогенераторы'],
    ['izmeritelnyy-instrument', 'Измерительный инструмент'],
    ['akb-i-zaryadnye-ustroystva', 'АКБ и зарядные устройства'],
    ['osnastka-i-rashodniki', 'Оснастка и расходники'],
    ['ruchnoy-instrument', 'Ручной инструмент'],
    ['krepezh', 'Крепёж']
  ];

  // Короткая строка характеристик для карточки — собирается из данных, а не хранится отдельно.
  const summary = p => [
    p.processes.join(', '),
    `${p.mains[0]}–${p.mains[1]} В`,
    `${p.current[0]}–${p.current[1]} А`,
    `ПВ ${p.duty}`,
    p.wire.length ? `проволока ${p.wire.map(w => String(w).replace('.', ',')).join('/')} мм` : `электрод до ${p.electrode} мм`,
    p.weight ? `${String(p.weight).replace('.', ',')} кг` : ''
  ].filter(Boolean).join(' · ');

  const stockLabel = p => p.stock
    ? '<span class="stock is-in"><i></i>В наличии</span>'
    : `<span class="stock"><i></i>Под заказ${p.lead ? ` · ${p.lead} ${plural(p.lead, 'день', 'дня', 'дней')}` : ''}</span>`;

  const productCard = p => {
    const fav = store.isFavorite(p.id), cmp = store.inCompare(p.id), qty = store.qty(p.id);
    return `
    <article class="card" data-id="${esc(p.id)}">
      <a class="card-media" href="product.html?id=${encodeURIComponent(p.id)}" tabindex="-1" aria-hidden="true">
        <img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" width="600" height="600">
      </a>
      <div class="card-flags"><span class="flag">МРЦ</span></div>
      <div class="card-actions">
        <button type="button" class="icon-btn${fav ? ' is-on' : ''}" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? 'Убрать из избранного' : 'В избранное'}">${icon.heart}</button>
        <button type="button" class="icon-btn${cmp ? ' is-on' : ''}" data-act="cmp" aria-pressed="${cmp}" aria-label="${cmp ? 'Убрать из сравнения' : 'Добавить к сравнению'}">${icon.compare}</button>
      </div>
      <div class="card-body">
        <h3 class="card-title"><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3>
        <p class="card-specs">${esc(summary(p))}</p>
        <p class="card-sku">Артикул: ${esc(p.sku)}</p>
        ${stockLabel(p)}
      </div>
      <div class="card-foot">
        <div class="price">
          <strong>${money(p.price)}</strong>
          <small>${icon.lock}Цена партнёра — после входа</small>
        </div>
        <div class="card-buttons">
          <a class="button button-ghost" href="product.html?id=${encodeURIComponent(p.id)}">Подробнее</a>
          <button type="button" class="button button-dark" data-act="req">${qty ? `В заявке · ${qty}` : 'В заявку'}</button>
        </div>
      </div>
    </article>`;
  };

  /* ---------- шапка, подвал, панели ---------- */
  const header = `
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="${MAIN_SITE}/" aria-label="APEXWOLT — на главную"><img src="assets/img/apexwolt-logo.svg" alt="APEXWOLT" width="158" height="85"></a>
      <div class="menu-wrap">
        <button type="button" class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="catalog-menu">${icon.menu}<span>Каталог</span></button>
        <div class="catalog-menu glass" id="catalog-menu" hidden>
          <p class="menu-title">Направления APEXWOLT</p>
          <ul>${sections.map(([k, t]) => `<li><a href="${k === 'svarochnoe-oborudovanie' ? 'index.html' : `${MAIN_SITE}/catalog?section=${k}`}"${k === 'svarochnoe-oborudovanie' ? ' aria-current="page"' : ''}>${esc(t)}</a></li>`).join('')}</ul>
        </div>
      </div>
      <form class="search" id="search" role="search" autocomplete="off">
        <label class="visually-hidden" for="search-input">Поиск по сварочному оборудованию</label>
        <input id="search-input" type="search" placeholder="Модель, артикул или тип сварки" aria-autocomplete="list" aria-controls="search-results">
        <button type="submit" aria-label="Найти">${icon.search}<span>Найти</span></button>
        <div class="search-results glass" id="search-results" role="listbox" hidden></div>
      </form>
      <nav class="header-icons" aria-label="Личное">
        <a class="hicon" href="${MAIN_SITE}/account.html">${icon.user}<span>Профиль</span></a>
        <button type="button" class="hicon" data-open="compare">${icon.compare}<span>Сравнение</span><b data-count="compare" hidden></b></button>
        <button type="button" class="hicon" data-open="favorites">${icon.heart}<span>Избранное</span><b data-count="favorites" hidden></b></button>
        <button type="button" class="hicon hicon-request" data-open="request">${icon.request}<span>Заявка</span><b data-count="request" hidden></b></button>
      </nav>
    </div>
  </header>`;

  const bottomNav = `
  <nav class="bottom-nav" aria-label="Быстрые действия">
    <a href="${MAIN_SITE}/account.html">${icon.user}<span>Профиль</span></a>
    <button type="button" data-open="compare">${icon.compare}<span>Сравнение</span><b data-count="compare" hidden></b></button>
    <button type="button" data-focus-search>${icon.search}<span>Поиск</span></button>
    <button type="button" data-open="favorites">${icon.heart}<span>Избранное</span><b data-count="favorites" hidden></b></button>
    <button type="button" data-open="request">${icon.request}<span>Заявка</span><b data-count="request" hidden></b></button>
  </nav>`;

  const footer = `
  <section class="subscribe">
    <div class="subscribe-copy">
      <h2>Новинки и спецусловия</h2>
      <p>Раз в месяц — новые модели, поступления и предложения для партнёров.</p>
    </div>
    <form class="subscribe-form" id="subscribe" novalidate>
      <label class="visually-hidden" for="sub-email">Email</label>
      <input id="sub-email" name="email" type="email" placeholder="email@company.ru" autocomplete="email" required>
      <button class="button button-dark" type="submit">Подписаться</button>
      <label class="check"><input type="checkbox" name="consent" required><span>Согласен получать рекламную рассылку и с <a href="${MAIN_SITE}/marketing-consent.html">условиями согласия</a></span></label>
      <p class="form-msg" role="status"></p>
    </form>
  </section>
  <footer class="site-footer">
    <div class="footer-grid">
      <div>
        <img class="footer-logo" src="assets/img/apexwolt-logo.svg" alt="APEXWOLT" width="158" height="85">
        <p class="muted">B2B-платформа APEXWOLT: подбор инструмента, заявка менеджеру и сопровождение партнёров. Оплата на сайте не производится.</p>
      </div>
      <div>
        <h3>Партнёрам</h3>
        <a href="${MAIN_SITE}/catalog">Весь каталог</a>
        <a href="${MAIN_SITE}/zayavka.html">Оформить заявку</a>
        <a href="${MAIN_SITE}/faq.html">Вопросы и ответы</a>
        <a href="${MAIN_SITE}/account.html">Кабинет организации</a>
      </div>
      <div>
        <h3>Документы</h3>
        <a href="${MAIN_SITE}/privacy.html">Политика конфиденциальности</a>
        <a href="${MAIN_SITE}/platform-rules.html">Правила платформы</a>
        <a href="${MAIN_SITE}/request-terms.html">Условия заявки</a>
        <a href="${MAIN_SITE}/consent-personal-data.html">Согласие на обработку данных</a>
        <a href="${MAIN_SITE}/cookie-policy.html">Cookie</a>
      </div>
      <div class="footer-company">
        <h3>Контакты</h3>
        <a href="tel:+79330238843">+7 (933) 023-88-43</a>
        <a href="mailto:idea.apexwolt@mail.ru">idea.apexwolt@mail.ru</a>
        <span>09:00–20:00 ежедневно</span>
        <span class="muted">ООО «АПЕКС» · ИНН 3804120303 · ОГРН 1243800003259</span>
      </div>
    </div>
    <p class="footer-bottom">APEXWOLT © ${new Date().getFullYear()} · Дизайн и разработка — <a href="https://t.me/aleks1y_m">LMH Studio</a></p>
  </footer>
  ${bottomNav}
  <div class="backdrop" id="backdrop" hidden></div>
  <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
    <button type="button" class="drawer-close icon-btn" data-close aria-label="Закрыть">${icon.close}</button>
    <div id="drawer-body"></div>
  </aside>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  document.querySelector('[data-slot="header"]').outerHTML = header;
  document.querySelector('[data-slot="footer"]').outerHTML = footer;

  /* ---------- toast ---------- */
  let toastTimer;
  const toast = text => {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
  };

  /* ---------- счётчики ---------- */
  const syncCounts = () => {
    const counts = {
      compare: store.compare().length,
      favorites: store.favorites().length,
      request: store.request().reduce((s, r) => s + r.qty, 0)
    };
    document.querySelectorAll('[data-count]').forEach(b => {
      const n = counts[b.dataset.count];
      b.textContent = n > 99 ? '99+' : n;
      b.hidden = !n;
    });
  };

  /* ---------- меню каталога ---------- */
  const menuBtn = document.getElementById('menu-btn');
  const menu = document.getElementById('catalog-menu');
  const setMenu = open => { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', open); };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.menu-wrap')) setMenu(false); });

  /* ---------- поиск с подсказками ---------- */
  const searchForm = document.getElementById('search');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9/]+/g, ' ').trim();
  const haystack = p => norm([
    p.name, p.sku, p.processes.join(' '),
    p.kind === 'mig' ? 'полуавтомат mig mag проволока' : 'инвертор mma ручная дуговая электрод',
    p.synergic ? 'синергетика синергетическое syn' : '',
    p.twoFourT ? '2t 4t' : '',
    p.hotStart ? 'hot start arc force antistick' : '',
    summary(p)
  ].join(' '));
  const findProducts = q => {
    const words = norm(q).split(' ').filter(Boolean);
    return words.length ? products.filter(p => words.every(w => haystack(p).includes(w))) : [];
  };
  const renderSuggestions = () => {
    const q = searchInput.value.trim();
    if (!q) { searchResults.hidden = true; return; }
    const found = findProducts(q).slice(0, 6);
    searchResults.innerHTML = found.length
      ? found.map(p => `<a role="option" href="product.html?id=${encodeURIComponent(p.id)}"><img src="${esc(p.image)}" alt=""><span><b>${esc(p.name)}</b><small>Артикул ${esc(p.sku)} · ${money(p.price)}</small></span></a>`).join('')
      : `<p class="search-empty">Ничего не нашлось по запросу «${esc(q)}». Попробуйте артикул, например 7/65/05, или «MMA».</p>`;
    searchResults.hidden = false;
  };
  searchInput.addEventListener('input', renderSuggestions);
  searchInput.addEventListener('focus', renderSuggestions);
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchResults.hidden = true; searchInput.blur(); }
    if (e.key === 'ArrowDown') { const first = searchResults.querySelector('a'); if (first) { e.preventDefault(); first.focus(); } }
  });
  searchResults.addEventListener('keydown', e => {
    const links = [...searchResults.querySelectorAll('a')];
    const i = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < links.length - 1) { e.preventDefault(); links[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? links[i - 1] : searchInput).focus(); }
    if (e.key === 'Escape') { searchResults.hidden = true; searchInput.focus(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#search')) searchResults.hidden = true; });
  searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) { searchInput.focus(); return; }
    searchResults.hidden = true;
    if (document.body.dataset.page === 'catalog') window.dispatchEvent(new CustomEvent('apex:search', { detail: q }));
    else location.href = `index.html?q=${encodeURIComponent(q)}`;
  });
  document.querySelectorAll('[data-focus-search]').forEach(b => b.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    searchInput.focus();
  }));

  /* ---------- панель (избранное / сравнение / заявка) ---------- */
  const drawer = document.getElementById('drawer');
  const drawerBody = document.getElementById('drawer-body');
  const backdrop = document.getElementById('backdrop');
  let drawerKind = null;
  let lastFocus = null;

  const miniRow = (p, extra = '') => `
    <li class="mini" data-id="${esc(p.id)}">
      <a href="product.html?id=${encodeURIComponent(p.id)}"><img src="${esc(p.image)}" alt=""></a>
      <div class="mini-info">
        <a href="product.html?id=${encodeURIComponent(p.id)}"><b>${esc(p.name)}</b></a>
        <small>Артикул ${esc(p.sku)} · МРЦ ${money(p.price)}</small>
        ${extra}
      </div>
    </li>`;

  const empty = (title, text) => `<div class="empty"><p class="empty-title">${title}</p><p>${text}</p><a class="button button-ghost" href="index.html" data-close>Перейти в каталог</a></div>`;

  const views = {
    favorites() {
      const list = store.favorites().map(store.byId);
      return `<h2 id="drawer-title">Избранное</h2>
        ${list.length ? `<ul class="mini-list">${list.map(p => miniRow(p, `<div class="mini-actions"><button type="button" class="link" data-act="req">В заявку</button><button type="button" class="link muted" data-act="fav">Убрать</button></div>`)).join('')}</ul>`
          : empty('Пока пусто', 'Отмечайте модели сердцем, чтобы вернуться к ним позже.')}`;
    },
    compare() {
      const list = store.compare().map(store.byId);
      if (!list.length) return `<h2 id="drawer-title">Сравнение</h2>${empty('Нечего сравнивать', `Добавьте до ${store.COMPARE_LIMIT} моделей кнопкой сравнения на карточке.`)}`;
      const rows = [
        ['МРЦ', p => money(p.price)],
        ['Наличие', p => p.stock ? 'В наличии' : 'Под заказ'],
        ['Тип сварки', p => p.processes.join(', ')],
        ['Сварочный ток', p => `${p.current[0]}–${p.current[1]} А`],
        ['Напряжение сети', p => `${p.mains[0]}–${p.mains[1]} В`],
        ['ПВ', p => p.duty],
        ['Электрод, до', p => p.electrode ? `${p.electrode} мм` : '—'],
        ['Проволока', p => p.wire.length ? `${p.wire.join(' / ').replace(/\./g, ',')} мм` : '—'],
        ['Hot Start / Arc Force', p => p.hotStart ? 'Есть' : 'Нет'],
        ['Синергетика', p => p.synergic ? 'Есть' : 'Нет'],
        ['2T/4T', p => p.twoFourT ? 'Есть' : 'Нет'],
        ['Масса', p => p.weight ? `${String(p.weight).replace('.', ',')} кг` : '—']
      ];
      const differs = fn => new Set(list.map(fn)).size > 1;
      return `<h2 id="drawer-title">Сравнение <span class="muted">${list.length} из ${store.COMPARE_LIMIT}</span></h2>
        <div class="compare-scroll"><table class="compare">
          <thead><tr><th scope="col"><span class="visually-hidden">Параметр</span></th>${list.map(p => `<th scope="col" data-id="${esc(p.id)}"><img src="${esc(p.image)}" alt=""><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a><button type="button" class="link muted" data-act="cmp">Убрать</button></th>`).join('')}</tr></thead>
          <tbody>${rows.map(([label, fn]) => `<tr class="${differs(fn) ? 'is-diff' : ''}"><th scope="row">${label}</th>${list.map(p => `<td>${esc(fn(p))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <p class="hint">Отличающиеся параметры подсвечены.</p>
        <button type="button" class="link muted" data-clear-compare>Очистить сравнение</button>`;
    },
    request() {
      const rows = store.request();
      if (!rows.length) return `<h2 id="drawer-title">Заявка</h2>${empty('В заявке пока нет позиций', 'Добавьте модели из каталога — менеджер подтвердит наличие, сроки и персональные цены.')}`;
      const total = rows.reduce((s, r) => s + store.byId(r.id).price * r.qty, 0);
      return `<h2 id="drawer-title">Заявка</h2>
        <ul class="mini-list">${rows.map(r => miniRow(store.byId(r.id), `
          <div class="qty" role="group" aria-label="Количество">
            <button type="button" data-qty="-1" aria-label="Меньше">−</button>
            <input type="number" inputmode="numeric" min="0" max="9999" value="${r.qty}" data-qty-input aria-label="Количество, шт.">
            <button type="button" data-qty="1" aria-label="Больше">+</button>
          </div>`)).join('')}</ul>
        <p class="total"><span>Ориентир по МРЦ</span><b>${money(total)}</b></p>
        <p class="hint">Итоговые цены и сроки подтвердит менеджер. Отправка заявки не является договором или оплатой.</p>
        <form class="request-form" id="request-form" novalidate>
          <div class="field"><label for="rq-company">Организация</label><input id="rq-company" name="company" autocomplete="organization" required></div>
          <div class="field"><label for="rq-inn">ИНН</label><input id="rq-inn" name="inn" inputmode="numeric" pattern="\\d{10}|\\d{12}" required></div>
          <div class="field"><label for="rq-name">Контактное лицо</label><input id="rq-name" name="name" autocomplete="name" required></div>
          <div class="field"><label for="rq-phone">Телефон</label><input id="rq-phone" name="phone" type="tel" autocomplete="tel" required></div>
          <div class="field"><label for="rq-email">Email</label><input id="rq-email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="rq-comment">Комментарий</label><textarea id="rq-comment" name="comment" rows="2" placeholder="Сроки, адрес доставки, вопросы"></textarea></div>
          <label class="check"><input type="checkbox" name="consent" required><span>Согласен на <a href="${MAIN_SITE}/consent-personal-data.html">обработку персональных данных</a> и с <a href="${MAIN_SITE}/request-terms.html">условиями заявки</a></span></label>
          <p class="form-msg" role="alert"></p>
          <button type="submit" class="button button-dark button-wide">Отправить менеджеру</button>
        </form>`;
    },
    sent(id) {
      return `<h2 id="drawer-title">Заявка сформирована</h2>
        <div class="empty is-success">${icon.check}<p class="empty-title">№ ${esc(id)}</p>
        <p>Это демонстрационный режим: заявка сохранена только в этом браузере и менеджеру пока не отправлена. Канал передачи (почта, Telegram или CRM) подключается на этапе backend.</p>
        <button type="button" class="button button-ghost" data-close>Готово</button></div>`;
    }
  };

  const renderDrawer = (kind = drawerKind, arg) => {
    drawerKind = kind;
    drawer.classList.toggle('is-wide', kind === 'compare');
    drawerBody.innerHTML = views[kind](arg);
  };
  const openDrawer = kind => {
    lastFocus = document.activeElement;
    renderDrawer(kind);
    drawer.hidden = backdrop.hidden = false;
    requestAnimationFrame(() => { drawer.classList.add('is-open'); backdrop.classList.add('is-open'); });
    document.body.classList.add('is-locked');
    drawer.querySelector('.drawer-close').focus();
  };
  const closeDrawer = () => {
    if (!drawerKind) return;
    drawerKind = null;
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(() => { if (!drawerKind) drawer.hidden = backdrop.hidden = true; }, 300);
    if (lastFocus) lastFocus.focus();
  };

  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open]');
    if (opener) { openDrawer(opener.dataset.open); return; }
    if (e.target.closest('[data-close]') || e.target === backdrop) {
      const link = e.target.closest('a[data-close]');
      if (link && document.body.dataset.page === 'catalog') e.preventDefault();
      closeDrawer();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (drawerKind) closeDrawer(); else setMenu(false); }
    if (e.key === 'Tab' && drawerKind) {
      const f = [...drawer.querySelectorAll('a[href],button,input,textarea,select')].filter(el => !el.disabled && el.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  drawer.addEventListener('click', e => {
    const row = e.target.closest('[data-id]');
    const qtyBtn = e.target.closest('[data-qty]');
    if (qtyBtn && row) store.setQty(row.dataset.id, store.qty(row.dataset.id) + Number(qtyBtn.dataset.qty));
    if (e.target.closest('[data-clear-compare]')) store.clearCompare();
  });
  drawer.addEventListener('change', e => {
    if (e.target.matches('[data-qty-input]')) store.setQty(e.target.closest('[data-id]').dataset.id, e.target.value);
  });
  drawer.addEventListener('submit', e => {
    if (e.target.id !== 'request-form') return;
    e.preventDefault();
    const form = e.target;
    const msg = form.querySelector('.form-msg');
    const bad = [...form.elements].find(el => el.willValidate && !el.checkValidity());
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    if (bad) {
      bad.classList.add('is-invalid');
      msg.textContent = bad.type === 'checkbox' ? 'Нужно согласие на обработку данных.'
        : bad.name === 'inn' ? 'ИНН — 10 цифр для организации или 12 для ИП.'
        : bad.type === 'email' && bad.value ? 'Проверьте email.' : 'Заполните обязательные поля.';
      bad.focus();
      return;
    }
    const id = `AW-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    try {
      const log = JSON.parse(localStorage.getItem('apx-weld-sent') || '[]');
      log.push({ id, at: new Date().toISOString(), items: store.request() });
      localStorage.setItem('apx-weld-sent', JSON.stringify(log));
    } catch { /* без истории */ }
    store.clearRequest();
    renderDrawer('request');
    drawerBody.innerHTML = views.sent(id);
    drawerKind = 'sent';
  });

  /* ---------- общие действия карточек ---------- */
  const act = (id, action) => {
    const p = store.byId(id);
    if (!p) return;
    if (action === 'fav') toast(store.toggleFavorite(id) ? 'Добавлено в избранное' : 'Убрано из избранного');
    if (action === 'cmp') {
      const r = store.toggleCompare(id);
      toast(r === null ? `В сравнении уже ${store.COMPARE_LIMIT} модели — уберите одну` : r ? 'Добавлено к сравнению' : 'Убрано из сравнения');
    }
    if (action === 'req') { store.addToRequest(id); toast(`${p.name} — в заявке`); }
  };
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    const holder = btn && btn.closest('[data-id]');
    if (btn && holder) act(holder.dataset.id, btn.dataset.act);
  });

  /* ---------- подписка ---------- */
  document.getElementById('subscribe').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, msg = f.querySelector('.form-msg');
    msg.classList.remove('is-ok');
    if (!f.email.checkValidity()) { msg.textContent = 'Укажите корректный email.'; f.email.focus(); return; }
    if (!f.consent.checked) { msg.textContent = 'Нужно согласие на рассылку.'; return; }
    msg.textContent = 'Готово! Адрес сохранён (демо: рассылка подключается на этапе backend).';
    msg.classList.add('is-ok');
    f.reset();
  });

  store.onChange(() => {
    syncCounts();
    if (drawerKind && drawerKind !== 'sent') {
      const active = document.activeElement && document.activeElement.closest('[data-id]');
      const focusId = active && active.dataset.id;
      const isInput = document.activeElement && document.activeElement.matches('[data-qty-input]');
      renderDrawer();
      if (focusId) {
        const again = drawer.querySelector(`[data-id="${CSS.escape(focusId)}"] ${isInput ? '[data-qty-input]' : 'button'}`);
        if (again) again.focus();
      }
    }
  });
  syncCounts();

  window.ApexUI = { esc, money, plural, icon, summary, stockLabel, productCard, toast, findProducts, openDrawer };
})();
